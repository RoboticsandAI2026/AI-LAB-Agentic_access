export type Role = "ADMIN" | "FACULTY" | "STUDENT";

// We'll treat "loginId" as the campus "User ID" (e.g., A0001, S1234)
export interface UserProfile {
  loginId: string;       // user id shown in UI / used on login screen
  role: Role;
  name: string;
  email: string;         // used by Firebase Auth
  phone?: string;
  avatarUrl?: string;
  department?: string;   // faculty
  designation?: string;  // faculty
  registerNo?: string;   // student
  year?: string;         // student
  branch?: string;       // student
  createdAt?: any;       // Firebase Timestamp
  updatedAt?: any;
}
