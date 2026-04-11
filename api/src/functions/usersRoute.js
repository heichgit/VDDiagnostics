import { app } from "@azure/functions";
import { getAuthFromRequest } from "../lib/jwt.js";
import { canManageUsers } from "../lib/roles.js";
import { bootstrapAdminIfEmpty, createUser, listUsersPublic } from "../lib/usersBlob.js";
import { getStorageConnectionString, storageMissingResponse } from "../lib/storageConnection.js";

app.http("usersMgmt", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "users",
  handler: async (request, context) => {
    const auth = getAuthFromRequest(request);
    if (!auth) {
      return { status: 401, jsonBody: { error: "Se requiere autenticación" } };
    }
    if (!canManageUsers(auth.roles)) {
      return { status: 403, jsonBody: { error: "Sin permiso para administrar usuarios" } };
    }

    const storage = getStorageConnectionString();
    if (!storage) {
      return storageMissingResponse();
    }

    await bootstrapAdminIfEmpty(storage, (m) => context.log(m));

    if (request.method === "GET") {
      try {
        const list = await listUsersPublic(storage);
        return { jsonBody: list };
      } catch (e) {
        context.error("[users GET]", e);
        return { status: 500, jsonBody: { error: String(e?.message || e) } };
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: "JSON inválido" } };
    }

    try {
      const created = await createUser(storage, {
        email: body?.email,
        password: body?.password,
        roles: body?.roles,
      });
      return { status: 201, jsonBody: created };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = msg.includes("ya está") ? 409 : 400;
      return { status, jsonBody: { error: msg } };
    }
  },
});
