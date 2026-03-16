
"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    User,
} from "firebase/auth";
import {
    doc,
    getDoc,
    setDoc,
    getDocs,
    collection,
    updateDoc,
    query,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export type UserRole = "admin" | "user";

interface UserProfile {
    uid: string;
    email: string;
    role: UserRole;
    createdAt: Date;
}

interface AuthContextType {
    user: User | null;
    userRole: UserRole | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    getAllUsers: () => Promise<UserProfile[]>;
    setUserRole: (uid: string, role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userRole, setUserRoleState] = useState<UserRole | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch user role from Firestore
    const fetchUserRole = async (uid: string): Promise<UserRole> => {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            return userDoc.data().role as UserRole;
        }
        return "user";
    };

    // Listen for auth state changes
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);
            if (firebaseUser) {
                try {
                    const role = await fetchUserRole(firebaseUser.uid);
                    setUserRoleState(role);
                } catch (error) {
                    console.error("Error fetching user role:", error);
                    setUserRoleState("user");
                }
            } else {
                setUserRoleState(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Sign in with email and password
    const signIn = async (email: string, password: string) => {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        try {
            const role = await fetchUserRole(credential.user.uid);
            setUserRoleState(role);
        } catch (error) {
            console.error("Error fetching user role during sign-in:", error);
            setUserRoleState("user");
        }
    };

    // Sign up with email and password
    const signUp = async (email: string, password: string) => {
        const credential = await createUserWithEmailAndPassword(auth, email, password);

        let role: UserRole = "user";

        try {
            // Check if this is the first user (make them admin)
            const usersSnapshot = await getDocs(query(collection(db, "users")));
            const isFirstUser = usersSnapshot.empty;
            if (isFirstUser) {
                role = "admin";
            }
        } catch (error) {
            console.error("Error checking for first user (likely permission denied):", error);
            // Default to 'user' if we can't read the collection
        }

        try {
            // Create user profile in Firestore
            await setDoc(doc(db, "users", credential.user.uid), {
                email: credential.user.email,
                role,
                createdAt: new Date(),
            });
            setUserRoleState(role);
        } catch (error) {
            console.error("Error creating user document in Firestore:", error);
            // Even if the document creation fails (e.g., due to strict rules), 
            // the authentication account is already created.
            setUserRoleState("user");
        }
    };

    // Sign out
    const signOut = async () => {
        await firebaseSignOut(auth);
        setUserRoleState(null);
    };

    // Get all users (admin only)
    const getAllUsers = async (): Promise<UserProfile[]> => {
        const usersSnapshot = await getDocs(collection(db, "users"));
        return usersSnapshot.docs.map((docSnap) => ({
            uid: docSnap.id,
            email: docSnap.data().email,
            role: docSnap.data().role as UserRole,
            createdAt: docSnap.data().createdAt?.toDate?.() || new Date(),
        }));
    };

    // Set user role (admin only)
    const setUserRole = async (uid: string, role: UserRole) => {
        await updateDoc(doc(db, "users", uid), { role });
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                userRole,
                loading,
                signIn,
                signUp,
                signOut,
                getAllUsers,
                setUserRole,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
