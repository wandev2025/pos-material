import { Redirect } from 'expo-router';

/**
 * This is the entry point (/). 
 * Using <Redirect /> ensures that as soon as the app loads, 
 * it immediately pushes the user to the login page without 
 * waiting for useEffect hooks to fire.
 */
export default function Index() {
  return <Redirect href="/login" />;
}