// Firebase JS SDK — pure JavaScript, no native modules needed.
// Works with Expo Go, dev builds, and the new architecture.

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore as _getFirestore, Firestore } from 'firebase/firestore';
import {
  initializeAuth,
  getReactNativePersistence,
  Auth,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyD-za4e69NK1yL53BjPXZlhjNJhpawRFro',
  authDomain: 'plant-tracker-b0286.firebaseapp.com',
  projectId: 'plant-tracker-b0286',
  storageBucket: 'plant-tracker-b0286.firebasestorage.app',
  messagingSenderId: '1090326668110',
  appId: '1:1090326668110:ios:b47c1518819b182e1c741f',
};

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

function getAppInstance(): FirebaseApp {
  if (!_app) {
    _app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  return _app;
}

export function getDb(): Firestore {
  if (!_db) {
    _db = _getFirestore(getAppInstance());
  }
  return _db;
}

export function getAuth(): Auth {
  if (!_auth) {
    _auth = initializeAuth(getAppInstance(), {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }
  return _auth;
}

// Firebase JS SDK is always available — no native modules needed.
export function isFirebaseAvailable(): boolean {
  return true;
}
