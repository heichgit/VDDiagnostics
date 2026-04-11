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
    const storage = getStorageConnectionString();
    if (!storage) {
      return storageMissingResponse();
    }
    await bootstrapAdminIfEmpty(storage, (m) => context.log(m));

    /** @type {Record<string, unknown> | null} */
    let postBody = null;
    if (request.method === "POST") {
      try {
        postBody = await request.json();
      } catch {
        return { status: 400, jsonBody: { error: "JSON inválido" } };
      }
    }

    const bodyJwt =
      postBody && typeof postBody._vdd_jwt === "string" ? postBody._vdd_jwt : undefined;
    const auth = getAuthFromRequest(request, bodyJwt);
    if (!auth) {
      return { status: 401, jsonBody: { error: "Se requiere autenticación" } };
    }
    if (!canManageUsers(auth.roles)) {
      return { status: 403, jsonBody: { error: "Sin permiso para administrar usuarios" } };
    }

    if (request.method === "GET") {
      try {
        const list = await listUsersPublic(storage);
        return { jsonBody: list };
      } catch (e) {
        context.error("[users GET]", e);
        return { status: 500, jsonBody: { error: String(e?.message || e) } };
      }
    }

    if (!postBody) {
      return { status: 400, jsonBody: { error: "JSON inválido" } };
    }

    try {
      const created = await createUser(storage, {
        email: postBody.email,
        password: postBody.password,
        roles: postBody.roles,
      });
      return { status: 201, jsonBody: created };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = msg.includes("ya está") ? 409 : 400;
      return { status, jsonBody: { error: msg } };
    }
  },
});
