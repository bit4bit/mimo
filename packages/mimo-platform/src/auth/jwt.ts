import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const secret = new TextEncoder().encode(JWT_SECRET);

export interface JWTPayload {
  username: string;
  exp?: number;
}

export async function generateToken(
  username: string,
  expiresIn: string = "7d"
): Promise<string> {
  const token = await new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
  
  return token;
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      username: payload.username as string,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}
