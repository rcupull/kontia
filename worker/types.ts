declare global {
  const __APP_VERSION__: string;
}

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
  BOOTSTRAP_SECRET: string;
  EXTERNAL_API_TOKEN: string;
};

export type SessionUser = {
  id: string;
  businessId: string;
  displayName: string;
  role: "owner" | "manager" | "seller";
};

export type Variables = { sessionUser: SessionUser };
