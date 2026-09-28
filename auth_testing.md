# Emergent Auth Testing Playbook

1. Open the app and select `Masuk dengan Google`.
2. After the callback, verify `/api/auth/me` returns the signed-in user.
3. Refresh the page and verify the dashboard remains authenticated through the httpOnly cookie.
4. Select `Keluar`, then verify the app returns to the sign-in screen and `/api/auth/me` returns 401.
5. Use a test identity only; never use real patient data during automated testing.