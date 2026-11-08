import type { UserProfile } from "../domain/types";

export interface UserRepository {
  findById(userId: string): Promise<UserProfile | null>;
}
