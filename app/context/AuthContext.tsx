import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  onAuthStateChanged,
  signInAnonymously as firebaseSignInAnonymously,
  signInWithCredential,
  signOut as firebaseSignOut,
  OAuthProvider,
  GoogleAuthProvider,
  User,
} from 'firebase/auth';
import { getAuth } from '@/services/firebase';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  iosClientId: '1090326668110-1epmdqq8btgaefmutp6u6tr12pfo4s6k.apps.googleusercontent.com',
});

const LOCAL_USER_KEY = 'LOCAL_AUTH_USER';

type AuthUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
  isAnonymous: boolean;
};

type AuthContextType = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  firebaseAvailable: boolean;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- Local-only auth helpers (Expo Go fallback) ---

async function loadLocalUser(): Promise<AuthUser | null> {
  const raw = await SecureStore.getItemAsync(LOCAL_USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function saveLocalUser(user: AuthUser): Promise<void> {
  await SecureStore.setItemAsync(LOCAL_USER_KEY, JSON.stringify(user));
}

async function clearLocalUser(): Promise<void> {
  await SecureStore.deleteItemAsync(LOCAL_USER_KEY);
}

function generateLocalUid(): string {
  return 'local_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const firebaseAvailable = true; // JS SDK is always available

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: User | null) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
          isAnonymous: firebaseUser.isAnonymous,
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithApple = async () => {
    if (Platform.OS !== 'ios') {
      throw new Error('Apple Sign-In is only available on iOS');
    }

    const nonce = Math.random().toString(36).substring(2, 10);
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      nonce,
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    const { identityToken } = credential;
    if (!identityToken) throw new Error('No identity token returned from Apple');

    const provider = new OAuthProvider('apple.com');
    const oauthCredential = provider.credential({
      idToken: identityToken,
      rawNonce: nonce,
    });
    await signInWithCredential(getAuth(), oauthCredential);
  };

  const signInAnonymously = async () => {
    await firebaseSignInAnonymously(getAuth());
  };

  const signInWithGoogle = async () => {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    const idToken = response.data?.idToken;
    if (!idToken) throw new Error('No ID token returned from Google');
    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(getAuth(), credential);
  };

  const handleSignOut = async () => {
    await firebaseSignOut(getAuth());
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    firebaseAvailable,
    signInWithApple,
    signInWithGoogle,
    signInAnonymously,
    signOut: handleSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
