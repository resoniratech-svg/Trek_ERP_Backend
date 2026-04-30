export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        division?: string;
        client_id?: string;
      };
    }
  }
}