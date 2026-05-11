import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_ISSUER = "imake";

export function createToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, storeId: user.storeId },
    JWT_SECRET,
    { expiresIn: "7d", issuer: JWT_ISSUER }
  );
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Não autenticado" });
  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER });
    req.user = { id: payload.sub, role: payload.role, email: payload.email, storeId: payload.storeId };
    next();
  } catch {
    return res.status(401).json({ error: "Sessão expirada" });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Somente administrador" });
  next();
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

