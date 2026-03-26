import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string | null;
      email: string;
      name: string;
      globalAdmin: boolean;
      generationLimit: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string | null;
    email: string;
    name: string;
    globalAdmin: boolean;
    generationLimit: number;
  }
}
