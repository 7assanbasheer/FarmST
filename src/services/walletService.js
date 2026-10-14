const { db } = require('../db/firebase');
const { FieldValue } = require('firebase-admin/firestore');

/**
 * خدمة المحافظ النقدية وإدارة المستخدمين والعهد
 */
const walletService = {
  /**
   * المستخدمون الأساسيون للمزرعة
   */
  defaultUsers: [
    { id: 'user_mohammed', username: 'mohammed', name: 'محمد', password: '123', role: 'مشرف / مسؤول عهدة', initial_balance: 0 },
    { id: 'user_ali', username: 'ali', name: 'علي', password: '123', role: 'مشرف / مسؤول عهدة', initial_balance: 0 },
    { id: 'user_hussein', username: 'hussein', name: 'حسين', password: '123', role: 'مشرف / مسؤول عهدة', initial_balance: 0 }
  ],

  /**
   * التأكد من وجود المستخدمين الثلاثة في Firestore وتحديث بيانات الدخول
   */
  async ensureUsersExist() {
    const usersColl = db.collection('users');
    for (const u of this.defaultUsers) {
      const userRef = usersColl.doc(u.id);
      const doc = await userRef.get();
      if (!doc.exists) {
        await userRef.set({
          name: u.name,
          username: u.username,
          password: u.password,
          role: u.role,
          wallet_balance: u.initial_balance || 0,
          created_at: FieldValue.serverTimestamp()
        });
      } else {
        const data = doc.data();
        if (!data.username || !data.password) {
          await userRef.update({
            username: u.username,
            password: u.password
          });
        }
      }
    }
  },

  /**
   * تسجيل الدخول باسم المستخدم وكلمة المرور
   */
  async login({ username, password }) {
    if (!username || !password) {
      throw new Error('يرجى إدخال اسم المستخدم وكلمة المرور.');
    }
    await this.ensureUsersExist();
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = String(password).trim();

    const snapshot = await db.collection('users').get();
    let matchedUser = null;

    snapshot.forEach(doc => {
      const data = doc.data();
      const uName = (data.username || '').toLowerCase();
      const name = (data.name || '').toLowerCase();
      if (cleanUsername === uName || cleanUsername === name) {
        if (String(data.password) === cleanPassword) {
          matchedUser = { id: doc.id, ...data };
        }
      }
    });

    if (!matchedUser) {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
    }

    delete matchedUser.password;
    return {
      success: true,
      user: matchedUser,
      message: `مرحباً بك يا ${matchedUser.name}`
    };
  },

  /**
   * جلب جميع المستخدمين مع أرصدة محافظهم الحالية
   */
  async getAllUsers() {
    await this.ensureUsersExist();
    const snapshot = await db.collection('users').get();
    const users = [];
    snapshot.forEach(doc => {
      users.push({
        id: doc.id,
        ...doc.data(),
        wallet_balance: Number(doc.data().wallet_balance || 0)
      });
    });
    // ترتيب ثابت: محمد، علي، حسين
    const order = ['user_mohammed', 'user_ali', 'user_hussein'];
    return users.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  },

  /**
   * إيداع أو تغذية عهدة أولية لمحفظة مستخدم
   */
  async depositToWallet({ userId, amount, notes = 'تغذية عهدة نقدية للمزرعة' }) {
    if (!userId || !amount || Number(amount) <= 0) {
      throw new Error('يرجى تحديد المستخدم والمبلغ بشكل صحيح.');
    }

    const numAmount = Number(amount);
    const userRef = db.collection('users').doc(userId);

    return await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error('المستخدم غير موجود.');

      const currentBalance = Number(userDoc.data().wallet_balance || 0);
      const newBalance = currentBalance + numAmount;

      transaction.update(userRef, {
        wallet_balance: newBalance,
        updated_at: FieldValue.serverTimestamp()
      });

      // تسجيل حركة الإيداع
      const txRef = db.collection('wallet_transactions').doc();
      transaction.set(txRef, {
        user_id: userId,
        user_name: userDoc.data().name,
        type: 'DEPOSIT',
        amount: numAmount,
        balance_after: newBalance,
        notes: notes,
        created_at: FieldValue.serverTimestamp(),
        date_str: new Date().toISOString().split('T')[0]
      });

      return {
        success: true,
        userId,
        userName: userDoc.data().name,
        newBalance,
        message: `تم إيداع ${numAmount} ريال في محفظة ${userDoc.data().name} بنجاح.`
      };
    });
  },

  /**
   * إنشاء طلب تسليم عهدة / كاش (طلب قبض معلق)
   */
  async createTransfer({ senderId, receiverId, amount, notes }) {
    if (!senderId || !receiverId) {
      throw new Error('يرجى تحديد الشخص المُسلِّم والمُستلِم.');
    }
    if (senderId === receiverId) {
      throw new Error('لا يمكن تحويل العهدة لنفس الشخص.');
    }
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('يرجى إدخال مبلغ صحيح للعهدة.');
    }

    const senderDoc = await db.collection('users').doc(senderId).get();
    const receiverDoc = await db.collection('users').doc(receiverId).get();

    if (!senderDoc.exists || !receiverDoc.exists) {
      throw new Error('أحد المستخدمين غير موجود.');
    }

    const senderBalance = Number(senderDoc.data().wallet_balance || 0);
    if (senderBalance < numAmount) {
      throw new Error(`رصيد محفظة ${senderDoc.data().name} غير كافٍ (${senderBalance} ريال). المطلوب تحويله: ${numAmount} ريال.`);
    }

    const transferRef = db.collection('custody_transfers').doc();
    const transferNumber = `TRF-${Date.now().toString().slice(-6)}`;

    const transferData = {
      transfer_number: transferNumber,
      sender_id: senderId,
      sender_name: senderDoc.data().name,
      receiver_id: receiverId,
      receiver_name: receiverDoc.data().name,
      amount: numAmount,
      status: 'PENDING', // معلق بانتظار تأكيد استلام الطرف الآخر
      notes: notes || 'تسليم عهدة نقدية',
      created_at: FieldValue.serverTimestamp(),
      created_date: new Date().toISOString().split('T')[0]
    };

    await transferRef.set(transferData);

    return {
      success: true,
      transferId: transferRef.id,
      transferNumber,
      senderName: senderDoc.data().name,
      receiverName: receiverDoc.data().name,
      amount: numAmount,
      message: `تم إرسال طلب تسليم عهدة بمبلغ ${numAmount} ريال إلى ${receiverDoc.data().name}. سيتم خصم وإضافة المبلغ فور تأكيده للاستلام.`
    };
  },

  /**
   * تأكيد الاستلام من قِبل المستلم (تحديث المحافظ فورياً)
   */
  async confirmTransfer(transferId, receiverId) {
    const transferRef = db.collection('custody_transfers').doc(transferId);

    return await db.runTransaction(async (transaction) => {
      const transferDoc = await transaction.get(transferRef);
      if (!transferDoc.exists) throw new Error('طلب العهدة غير موجود.');

      const transfer = transferDoc.data();
      if (transfer.status !== 'PENDING') {
        throw new Error(`هذا الطلب تم معالجته مسبقاً بحالة (${transfer.status}).`);
      }

      if (receiverId && transfer.receiver_id !== receiverId) {
        throw new Error('لا تملك الصلاحية لتأكيد استلام هذا الطلب.');
      }

      const senderRef = db.collection('users').doc(transfer.sender_id);
      const receiverRef = db.collection('users').doc(transfer.receiver_id);

      const senderDoc = await transaction.get(senderRef);
      const receiverDoc = await transaction.get(receiverRef);

      const senderBalance = Number(senderDoc.data().wallet_balance || 0);
      const receiverBalance = Number(receiverDoc.data().wallet_balance || 0);

      if (senderBalance < transfer.amount) {
        throw new Error(`رصيد المسلّم (${transfer.sender_name}) لم يعد كافياً لإتمام العملية.`);
      }

      const newSenderBalance = senderBalance - transfer.amount;
      const newReceiverBalance = receiverBalance + transfer.amount;

      // 1. تحديث أرصدة المستخدمين
      transaction.update(senderRef, {
        wallet_balance: newSenderBalance,
        updated_at: FieldValue.serverTimestamp()
      });

      transaction.update(receiverRef, {
        wallet_balance: newReceiverBalance,
        updated_at: FieldValue.serverTimestamp()
      });

      // 2. تحديث حالة الطلب
      transaction.update(transferRef, {
        status: 'CONFIRMED',
        confirmed_at: FieldValue.serverTimestamp(),
        confirmed_date: new Date().toISOString().split('T')[0]
      });

      // 3. توثيق حركة الخصم للمسلّم
      const senderTxRef = db.collection('wallet_transactions').doc();
      transaction.set(senderTxRef, {
        user_id: transfer.sender_id,
        user_name: transfer.sender_name,
        type: 'TRANSFER_OUT',
        amount: -transfer.amount,
        balance_after: newSenderBalance,
        transfer_id: transferId,
        party_name: transfer.receiver_name,
        notes: `تسليم عهدة إلى ${transfer.receiver_name}: ${transfer.notes || ''}`,
        created_at: FieldValue.serverTimestamp(),
        date_str: new Date().toISOString().split('T')[0]
      });

      // 4. توثيق حركة الإضافة للمستلم
      const receiverTxRef = db.collection('wallet_transactions').doc();
      transaction.set(receiverTxRef, {
        user_id: transfer.receiver_id,
        user_name: transfer.receiver_name,
        type: 'TRANSFER_IN',
        amount: transfer.amount,
        balance_after: newReceiverBalance,
        transfer_id: transferId,
        party_name: transfer.sender_name,
        notes: `استلام وقبض عهدة من ${transfer.sender_name}: ${transfer.notes || ''}`,
        created_at: FieldValue.serverTimestamp(),
        date_str: new Date().toISOString().split('T')[0]
      });

      return {
        success: true,
        message: `تم تأكيد قبض واستلام مبلغ ${transfer.amount} ريال بنجاح. تم تحديث المحفظتين فورياً!`,
        transferNumber: transfer.transfer_number,
        newReceiverBalance,
        senderName: transfer.sender_name
      };
    });
  },

  /**
   * رفض أو إلغاء طلب العهدة المعلق
   */
  async rejectTransfer(transferId, userId) {
    const transferRef = db.collection('custody_transfers').doc(transferId);
    const doc = await transferRef.get();
    if (!doc.exists) throw new Error('الطلب غير موجود.');

    const data = doc.data();
    if (data.status !== 'PENDING') throw new Error('الطلب ليس في حالة معلقة.');

    if (userId && data.sender_id !== userId && data.receiver_id !== userId) {
      throw new Error('ليس لديك صلاحية لإلغاء هذا الطلب.');
    }

    await transferRef.update({
      status: 'REJECTED',
      rejected_at: FieldValue.serverTimestamp()
    });

    return {
      success: true,
      message: 'تم إلغاء / رفض طلب العهدة.'
    };
  },

  /**
   * جلب طلبات التحويل (الكل أو بحسب المستخدم أو الحالة)
   */
  async getTransfers({ userId, status } = {}) {
    let query = db.collection('custody_transfers');
    const snapshot = await query.get();
    const transfers = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      let match = true;
      if (status && data.status !== status) match = false;
      if (userId && data.sender_id !== userId && data.receiver_id !== userId) match = false;

      if (match) {
        transfers.push({
          id: doc.id,
          ...data
        });
      }
    });

    // ترتيب من الأحدث إلى الأقدم
    return transfers.sort((a, b) => {
      const timeA = a.created_at?._seconds || 0;
      const timeB = b.created_at?._seconds || 0;
      return timeB - timeA;
    });
  },

  /**
   * جلب سجل حركات المحفظة لمستخدم معين
   */
  async getUserTransactions(userId) {
    let query = db.collection('wallet_transactions');
    if (userId) {
      query = query.where('user_id', '==', userId);
    }
    const snapshot = await query.get();
    const list = [];
    snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));

    return list.sort((a, b) => {
      const timeA = a.created_at?._seconds || 0;
      const timeB = b.created_at?._seconds || 0;
      return timeB - timeA;
    });
  }
};

module.exports = walletService;
