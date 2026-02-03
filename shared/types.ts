/**
 * Unified type exports for Firestore collections
 */

import { Timestamp } from "firebase/firestore";

export type ProjectStatus = "draft" | "published" | "closed" | "completed";
export type ProjectType = "sukuk" | "land_development" | "vip_exclusive";
export type InvestmentStatus = 
  | "pending" 
  | "pending_review" 
  | "pending_contract" 
  | "signing" 
  | "signed" 
  | "active" 
  | "rejected" 
  | "completed";

export interface Project {
  id: string;
  issueNumber: string;
  titleAr: string;
  titleEn?: string;
  descriptionAr: string;
  descriptionEn?: string;
  locationAr: string;
  locationEn?: string;
  projectType: ProjectType;
  status: ProjectStatus;
  
  // Financials
  targetAmount: number;
  currentAmount: number;
  minInvestment: number;
  annualReturn: number;
  duration: number; // in months
  investorsCount: number;
  
  // Media
  coverImage: string;
  gallery?: string[];
  
  // Timeline
  plannedLaunchAt?: Timestamp;
  actualLaunchAt?: Timestamp;
  plannedEndAt?: Timestamp;
  actualEndAt?: Timestamp;
  
  // Delay tracking
  launchDelayDays?: number;
  endDelayDays?: number;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Investment {
  id: string;
  projectId: string;
  projectTitle: string;
  investorUid: string;
  investorName: string;
  amount: number;
  status: InvestmentStatus;
  
  // Payment logic
  paymentFrequency: "monthly" | "quarterly" | "once" | "hybrid";
  
  // Dates
  signedAt?: Timestamp; // Actual start of investment
  
  // Delay compensation
  delayPenaltyApplied?: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserMeta {
  totalInvested: number;
  activeInvestmentsCount: number;
  vipStatus: "none" | "vip";
  role: "client" | "admin" | "guest";
}

export * from "./_core/errors";
