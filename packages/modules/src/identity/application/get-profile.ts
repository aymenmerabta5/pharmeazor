import { type UserProfile } from "../domain/types";

export interface GetProfileInput {
  userId: string;
}

export interface GetProfileDeps {
  findById: (userId: string) => Promise<UserProfile | null>;
}

export async function getProfileUseCase(
  input: GetProfileInput,
  deps: GetProfileDeps,
): Promise<UserProfile | null> {
  return deps.findById(input.userId);
}
