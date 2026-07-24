/**
 * Repository Interface: UserPrediction
 */
import type { UserPrediction } from "../entities/user-prediction"

export interface UserPredictionRepository {
  findById(id: string): Promise<UserPrediction | null>
  findByUser(userId: string, limit: number, offset: number): Promise<UserPrediction[]>
  countByUser(userId: string): Promise<number>
  save(prediction: UserPrediction): Promise<UserPrediction>
  deleteById(id: string): Promise<boolean>
}
