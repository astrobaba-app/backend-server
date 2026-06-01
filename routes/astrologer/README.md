# Astrologer Routes API (Current)

Mounted route groups:
- Auth routes: `/api/astrologer/auth`

---

## Auth V2 Routes (`/api/astrologer/auth/v2`) - Backend OTP (4-digit, Redis)

> This flow does **not** use Firebase OTP.
> OTP is generated in backend and stored in Redis under `astrologer:v2:otp:<phone>`.

### 1) POST `/v2/send-otp`
Request body:
```json
{
  "phoneNumber": "9876543210"
}
```
Success `200`:
```json
{
  "success": true,
  "accountExists": false,
  "isApproved": false,
  "message": "OTP sent successfully",
  "phoneNumber": "9876543210"
}
```
Notes:
- Calls provider stub: `services/otpProviders/sendAstrologerOtpV2.js`
- Currently logs OTP in backend console

Common errors:
- `400`: invalid phone number
- `403`: pending approval
- `500`: send failed

### 2) POST `/v2/verify-otp`
Request body:
```json
{
  "phoneNumber": "9876543210",
  "otp": "1234"
}
```
Success (new user) `200`:
```json
{
  "success": true,
  "requiresRegistration": true,
  "message": "Phone number verified successfully",
  "phoneNumber": "9876543210"
}
```
Success (approved existing astrologer login) `200`:
```json
{
  "success": true,
  "message": "Login successful",
  "requiresRegistration": false,
  "token": "jwt",
  "astrologerToken": "middleware-jwt",
  "astrologer": { "id": "..." }
}
```
Common errors:
- `400`: missing/invalid OTP, OTP expired, invalid OTP
- `403`: pending approval, deactivated
- `500`: verify failed

### 3) POST `/v2/register`
Content-Type:
- `multipart/form-data` (supports optional `photo` file)

Request fields:
- Required:
  - `phoneNumber`
  - `fullName`
  - `languages`
  - `skills`
  - `categories`
- Optional:
  - `email`
  - `dateOfBirth`
  - `gender`
  - `yearsOfExperience`
  - `pricePerMinute`
  - `bio`
  - `availability`
  - `photo` (file)

Success `201`:
```json
{
  "success": true,
  "message": "Your application has been submitted successfully. You will receive an SMS and/or email once your account is approved by our team.",
  "astrologer": {
    "id": "...",
    "categories": ["Love"],
    "isApproved": false
  }
}
```
Common errors:
- `400`: validation failures, duplicates, invalid categories/gender
- `403`: phone verification expired/not found
- `500`: registration failed

---

