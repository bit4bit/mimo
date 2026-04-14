import { SignJWT, jwtVerify } from "jose";

const DEFAULT_JWT_SECRET = "your-secret-key-change-in-production";

export interface JWTPayload {
  username: string;
  exp?: number;
}

export class JwtService {
  private secret: Uint8Array;

  constructor(secret: string = process.env.JWT_SECRET || DEFAULT_JWT_SECRET) {
    this.secret = new TextEncoder().encode(secret);
  }

  async generateToken(
    username: string,
    expiresIn: string = "7d"
  ): Promise<string> {
    const token = await new SignJWT({ username })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(this.secret);

    return token;
  }

  async verifyToken(token: string): Promise<JWTPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      return {
        username: payload.username as string,
        exp: payload.exp,
      };
    } catch {
      return null;
    }
  }
}

export const jwtService = new JwtService();

export async function generateToken(username: string, expiresIn: string = "7d"): Promise<string> {
  return jwtService.generateToken(username, expiresIn);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  return jwtService.verifyToken(token);
}
