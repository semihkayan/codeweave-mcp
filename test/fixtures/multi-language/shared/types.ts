export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
}

export interface OrderItem {
  name: string;
  price: number;
  quantity: number;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}
