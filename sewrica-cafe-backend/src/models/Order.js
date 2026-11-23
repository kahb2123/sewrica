const { createModel } = require('./documentModel');

module.exports = createModel('Order', {
  uniqueFields: ['orderNumber', 'lotteryTicketNumber'],
  hiddenFields: ['guestAccessTokenHash'],
  timestamps: true,
  defaults: {
    status: 'pending',
    paymentStatus: 'pending',
    customer: null,
    createdBy: null,
    processedBy: null,
    lotteryEligible: true,
    lotteryWon: false,
    lotteryPrizeClaimed: false,
    lotteryTicketNumber: null,
    processedByName: '',
    assignedChef: null,
    assignedDelivery: null,
    assignedWaiter: null,
    chefAccepted: false,
    chefRejected: false,
    chefNotes: '',
    deliveryAccepted: false,
    deliveryRejected: false,
    deliveryNotes: '',
    cookingTime: 0,
    deliveryTime: 'asap',
    orderSource: 'web',
    statusHistory: [],
    notificationsSent: {
      chefAssigned: false,
      deliveryAssigned: false,
      orderReady: false,
      orderDelivered: false
    }
  },
  populate: {
    customer: 'User',
    createdBy: 'User',
    processedBy: 'User',
    assignedChef: 'User',
    assignedDelivery: 'User',
    assignedWaiter: 'User',
    items: 'MenuItem'
  },
  dateFields: [
    'createdAt', 'updatedAt', 'paidAt', 'processedAt', 'lotteryPrizeClaimedAt',
    'chefAcceptedAt', 'chefRejectedAt', 'deliveryAcceptedAt', 'deliveryRejectedAt',
    'cookingStartedAt', 'cookingCompletedAt', 'deliveryStartedAt',
    'deliveryCompletedAt', 'waiterCompletedAt', 'assignedAt.chef',
    'assignedAt.delivery', 'assignedAt.waiter', 'statusHistory.changedAt'
  ],
  validate(order) {
    if (!order.orderNumber || !order.paymentMethod || !order.deliveryMethod || !Array.isArray(order.items)) {
      throw new Error('Order is missing required fields');
    }
    if (!['pending', 'confirmed', 'preparing', 'cooking', 'ready', 'out-for-delivery', 'delivered', 'cancelled'].includes(order.status)) {
      throw new Error('Invalid order status');
    }
    if (!['pending', 'processing', 'completed', 'failed', 'refunded'].includes(order.paymentStatus)) {
      throw new Error('Invalid payment status');
    }
    if (!['cash', 'card', 'tele_birr', 'bank'].includes(order.paymentMethod)) {
      throw new Error('Invalid payment method');
    }
    if (!['delivery', 'pickup', 'dine-in'].includes(order.deliveryMethod)) {
      throw new Error('Invalid delivery method');
    }
  }
});
