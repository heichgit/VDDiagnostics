import { app } from "@azure/functions";
import { signToken, getAuthFromRequest } from "../lib/jwt.js";
import { verifyCredentials, bootstrapAdminIfEmpty } from "../lib/usersBlob.js";
import { getStorageConnectionString, storageMissingResponse } from "../lib/storageConnection.js";

app.http("authLogin", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/login",
  handler: async (request, context) => {
    const storage = getStorageConnectionString();
    if (!storage) {
      return storageMissingResponse();
    }
    if (!process.env.JWT_SECRET) {
      return { status: 500, jsonBody: { error: "JWT_SECRET no configurado en Application settings" } };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: "JSON inválido" } };
    }

    const email = String(body?.email ?? "").trim();
    const password = String(body?.password ?? "");
    if (!email || !password) {
      return { status: 400, jsonBody: { error: "Email y contraseña requeridos" } };
    }

    try {
      await bootstrapAdminIfEmpty(storage, (m) => context.log(m));
      const user = await verifyCredentials(storage, email, password);
      if (!user) {
        return { status: 401, jsonBody: { error: "Credenciales incorrectas" } };
      }
      const token = signToken({ sub: user.id, email: user.email, roles: user.roles });
      return {
        jsonBody: {
          token,
          user: { id: user.id, email: user.email, roles: user.roles },
        },
      };
    } catch (e) {
      context.error("[authLogin]", e);
      return { status: 500, jsonBody: { error: String(e?.message || e) } };
    }
  },
});

app.http("authMe", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/me",
  handler: async (request, context) => {
    const auth = getAuthFromRequest(request);
    if (!auth) {
      return { status: 401, jsonBody: { error: "Se requiere autenticación" } };
    }
    return {
      status: 200,
      jsonBody: { id: auth.sub, email: auth.email, roles: auth.roles },
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    };
  },
});
