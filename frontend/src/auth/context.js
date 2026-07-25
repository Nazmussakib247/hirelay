/* Auth context — provided by the App root, consumed app-wide via useAuth().
   Extracted from App.jsx (frontend decomposition, phase 2).

   Kept in its own module (rather than App.jsx) so feature components can import
   useAuth without importing App — which would create a circular dependency. */

import { createContext, useContext } from "react";

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
