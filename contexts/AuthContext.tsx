/** Owns Firebase-backed identity state and exposes supported sign-in methods to routes. */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import {
  onAuthStateChanged,
  signInAnonymously as firebaseSignInAnonymously,
  signInWithCredential,
  reauthenticateWithCredential,
  deleteUser,
  AuthCredential,
  signOut as firebaseSignOut,
  OAuthProvider,
  GoogleAuthProvider,
  User,
} from 'firebase/auth';
import { getAuth, isFirebaseAvailable } from '@/services/firebase';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

const IOS_GOOGLE_CLIENT_ID = '1090326668110-1epmdqq8btgaefmutp6u6tr12pfo4s6k.apps.googleusercontent.com';
const GOOGLE_WEB_CLIENT_ID =
  (typeof process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID === 'string'
    ? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.trim()
    : '') ||
  (typeof Constants.expoConfig?.extra?.googleWebClientId === 'string'
    ? Constants.expoConfig.extra.googleWebClientId.trim()
    : '');
const GOOGLE_SIGN_IN_AVAILABLE = Platform.OS !== 'android' || GOOGLE_WEB_CLIENT_ID.length > 0;

GoogleSignin.configure({
  iosClientId: IOS_GOOGLE_CLIENT_ID,
  ...(GOOGLE_WEB_CLIENT_ID ? { webClientId: GOOGLE_WEB_CLIENT_ID } : {}),
});

/** Minimal identity shape exposed to the rest of the app. */
type AuthUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
  isAnonymous: boolean;
};

/** Authentication state and operations available through `useAuth()`. */
type AuthContextType = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  firebaseAvailable: boolean;
  googleSignInAvailable: boolean;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: (deleteCloudData: (userId: string) => Promise<void>) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function clearLocalUser(): Promise<void> {
  await SecureStore.deleteItemAsync('LOCAL_AUTH_USER');
}

/** Subscribe to Firebase auth state and provide sign-in actions to the route tree. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const firebaseAvailable = isFirebaseAvailable();
  const googleSignInAvailable = GOOGLE_SIGN_IN_AVAILABLE;

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

  const getAppleCredential = async (): Promise<AuthCredential> => {
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
    return provider.credential({
      idToken: identityToken,
      rawNonce: nonce,
    });
  };

  const signInWithApple = async () => {
    await signInWithCredential(getAuth(), await getAppleCredential());
  };

  const signInAnonymously = async () => {
    await firebaseSignInAnonymously(getAuth());
  };

  const getGoogleCredential = async (): Promise<AuthCredential> => {
    if (!googleSignInAvailable) {
      throw new Error(
        'Google sign-in is not configured for this Android build yet. Use Share Code Only for now, or add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and rebuild.',
      );
    }

    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    const idToken = response.data?.idToken;
    if (!idToken) throw new Error('No ID token returned from Google');
    return GoogleAuthProvider.credential(idToken);
  };

  const signInWithGoogle = async () => {
    await signInWithCredential(getAuth(), await getGoogleCredential());
  };

  const handleSignOut = async () => {
    let signOutError: unknown;

    try {
      await firebaseSignOut(getAuth());
    } catch (error) {
      signOutError = error;
    }

    await clearLocalUser();

    try {
      await GoogleSignin.signOut();
    } catch {
      // Ignore: most sign-outs are anonymous or Apple-based.
    }

    try {
      await GoogleSignin.revokeAccess();
    } catch {
      // Ignore: revoke fails when there is no cached Google session.
    }

    setUser(null);

    if (signOutError) {
      throw signOutError;
    }
  };

  /**
   * Permanently delete the signed-in account. The user is re-verified first so that a cancelled
   * prompt leaves everything untouched; cloud data is erased before the auth user itself.
   */
  const deleteAccount = async (deleteCloudData: (userId: string) => Promise<void>) => {
    const currentUser = getAuth().currentUser;
    if (!currentUser) {
      throw new Error('You are not signed in.');
    }

    const providerId = currentUser.providerData[0]?.providerId;
    if (providerId === 'apple.com') {
      await reauthenticateWithCredential(currentUser, await getAppleCredential());
    } else if (providerId === 'google.com') {
      await reauthenticateWithCredential(currentUser, await getGoogleCredential());
    }

    await deleteCloudData(currentUser.uid);
    await deleteUser(currentUser);
    await clearLocalUser();

    try {
      await GoogleSignin.revokeAccess();
    } catch {
      // Ignore: there is no cached Google session for Apple or anonymous accounts.
    }

    setUser(null);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    firebaseAvailable,
    googleSignInAvailable,
    signInWithApple,
    signInWithGoogle,
    signInAnonymously,
    signOut: handleSignOut,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Read authentication state; throws when rendered outside `AuthProvider`. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}