#  Kundli Matching API Documentation

Complete API documentation for Kundli Matching (Gun Milan) services, including request/response formats, Ashtakoot Gun Milan points, Manglik Dosha analysis, and AI-enhanced compatibility reports.

---

##  Base Path

```
/api/kundli-matching
```

---

## Authentication

All endpoints require authentication using JWT tokens.

- **Header Format**: `Authorization: Bearer <token>`
- **Cookie Format**: Cookie containing auth session token.

---

##  API Endpoints Summary

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/kundli-matching/create` | Calculate Kundli matching & save profile | Yes |
| `GET` | `/api/kundli-matching/all` | Fetch all saved matching profiles for user | Yes |
| `GET` | `/api/kundli-matching/:matchingId` | Fetch details of a specific matching profile | Yes |
| `DELETE` | `/api/kundli-matching/:matchingId` | Delete a saved matching profile | Yes |

---

##  1. Create Kundli Matching Profile

Calculates Ashtakoot Gun Milan score (out of 36 points), Manglik Dosha analysis for both partners, AI-enhanced life aspect explanations, Lagna charts, and saves the matching profile to the database.

### HTTP Request

- **Method**: `POST`
- **URL**: `/api/kundli-matching/create`
- **Headers**:
  ```http
  Content-Type: application/json
  Authorization: Bearer <your_user_jwt_token>
  ```

### Request Body Schema

```json
{
  "boyName": "String (Required)",
  "boyDateOfBirth": "String YYYY-MM-DD or ISO (Required)",
  "boyTimeOfBirth": "String HH:MM or HH:MM:SS (Required)",
  "boyPlaceOfBirth": "String (Required)",
  "boyLatitude": "Number (Required)",
  "boyLongitude": "Number (Required)",
  "girlName": "String (Required)",
  "girlDateOfBirth": "String YYYY-MM-DD or ISO (Required)",
  "girlTimeOfBirth": "String HH:MM or HH:MM:SS (Required)",
  "girlPlaceOfBirth": "String (Required)",
  "girlLatitude": "Number (Required)",
  "girlLongitude": "Number (Required)"
}
```

### Request Body Example

```json
{
  "boyName": "Rahul Sharma",
  "boyDateOfBirth": "1995-05-15",
  "boyTimeOfBirth": "14:30",
  "boyPlaceOfBirth": "New Delhi, India",
  "boyLatitude": 28.6139,
  "boyLongitude": 77.2090,
  "girlName": "Priya Patel",
  "girlDateOfBirth": "1997-08-20",
  "girlTimeOfBirth": "09:15",
  "girlPlaceOfBirth": "Mumbai, India",
  "girlLatitude": 19.0760,
  "girlLongitude": 72.8777
}
```

### Response Schema (`201 Created`)

```json
{
  "success": true,
  "message": "Kundli matching completed successfully",
  "matching": {
    "id": "e4b9a1c8-2f3b-4c5d-6e7f-8a9b0c1d2e3f",
    "userId": "u1234567-89ab-cdef-0123-456789abcdef",
    "boyName": "Rahul Sharma",
    "boyDateOfBirth": "1995-05-15",
    "boyTimeOfBirth": "14:30:00",
    "boyPlaceOfBirth": "New Delhi, India",
    "boyLatitude": 28.6139,
    "boyLongitude": 77.209,
    "girlName": "Priya Patel",
    "girlDateOfBirth": "1997-08-20",
    "girlTimeOfBirth": "09:15:00",
    "girlPlaceOfBirth": "Mumbai, India",
    "girlLatitude": 19.076,
    "girlLongitude": 72.8777,
    "compatibilityScore": 75.0,
    "ashtakootDetails": {
      "total_points": 27,
      "max_points": 36,
      "received_percentage": 75,
      "kutas": {
        "varna": {
          "points": 1,
          "max_points": 1,
          "area_of_life": "Ego & Spiritual Compatibility",
          "description": "Matching Varna indicates mutual respect and shared values.",
          "meaning": "Reflects work and spiritual alignment."
        },
        "vashya": {
          "points": 2,
          "max_points": 2,
          "area_of_life": "Mutual Attraction & Dominance",
          "description": "Good magnetic control and harmony between partners."
        },
        "tara": {
          "points": 3,
          "max_points": 3,
          "area_of_life": "Destiny & Health Compatibility"
        },
        "yoni": {
          "points": 4,
          "max_points": 4,
          "area_of_life": "Intimate & Sexual Harmony"
        },
        "graha_maitri": {
          "points": 5,
          "max_points": 5,
          "area_of_life": "Psychological & Intellectual Connection"
        },
        "gana": {
          "points": 6,
          "max_points": 6,
          "area_of_life": "Temperament & Nature"
        },
        "bhakoot": {
          "points": 0,
          "max_points": 7,
          "area_of_life": "Family Welfare & Financial Growth"
        },
        "nadi": {
          "points": 6,
          "max_points": 8,
          "area_of_life": "Genetic Compatibility & Procreation"
        }
      }
    },
    "manglikDetails": {
      "male_manglik": false,
      "female_manglik": true,
      "male_manglik_details": {
        "present": false,
        "ui_aspects": "No adverse planetary positions detected.",
        "ui_house": "Mars is comfortably placed.",
        "ui_analysis": "Rahul does not have Manglik Dosha."
      },
      "female_manglik_details": {
        "present": true,
        "ui_aspects": "Mars influences 7th house of marriage.",
        "ui_house": "Mars situated in 1st house.",
        "ui_analysis": "Priya has Manglik Dosha; remedy recommended."
      }
    },
    "boyPlanetDetails": [],
    "girlPlanetDetails": [],
    "boyLagnaChart": null,
    "girlLagnaChart": null,
    "boyAscendant": null,
    "girlAscendant": null,
    "conclusion": "Excellent match! Very compatible for marriage.",
    "createdAt": "2026-09-18T10:00:00.000Z",
    "updatedAt": "2026-09-18T10:00:00.000Z"
  }
}
```

### Error Responses

#### 1. `400 Bad Request` (Missing Required Fields)
```json
{
  "success": false,
  "message": "Missing required fields: boyName, boyDateOfBirth, girlLatitude"
}
```

#### 2. `401 Unauthorized`
```json
{
  "success": false,
  "message": "Authentication required"
}
```

#### 3. `500 Internal Server Error`
```json
{
  "success": false,
  "message": "Failed to create kundli matching",
  "error": "Internal server error message"
}
```

---

## 📜 2. Get All Matching Profiles

Retrieves a list of all saved Kundli matching summaries for the authenticated user.

### HTTP Request

- **Method**: `GET`
- **URL**: `/api/kundli-matching/all`
- **Headers**:
  ```http
  Authorization: Bearer <your_user_jwt_token>
  ```

### Response Schema (`200 OK`)

```json
{
  "success": true,
  "count": 2,
  "matchings": [
    {
      "id": "e4b9a1c8-2f3b-4c5d-6e7f-8a9b0c1d2e3f",
      "boyName": "Rahul Sharma",
      "girlName": "Priya Patel",
      "compatibilityScore": 75.0,
      "conclusion": "Excellent match! Very compatible for marriage.",
      "createdAt": "2026-09-18T10:00:00.000Z"
    },
    {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "boyName": "Amit Kumar",
      "girlName": "Neha Singh",
      "compatibilityScore": 55.5,
      "conclusion": "Good match! Compatible with some areas to work on.",
      "createdAt": "2026-09-17T15:30:00.000Z"
    }
  ]
}
```

---

## 🔍 3. Get Matching Profile by ID

Retrieves full detailed match data for a specific matching profile ID owned by the user.

### HTTP Request

- **Method**: `GET`
- **URL**: `/api/kundli-matching/:matchingId`
- **Headers**:
  ```http
  Authorization: Bearer <your_user_jwt_token>
  ```

### Response Schema (`200 OK`)

```json
{
  "success": true,
  "matching": {
    "id": "e4b9a1c8-2f3b-4c5d-6e7f-8a9b0c1d2e3f",
    "userId": "u1234567-89ab-cdef-0123-456789abcdef",
    "boyName": "Rahul Sharma",
    "boyDateOfBirth": "1995-05-15",
    "boyTimeOfBirth": "14:30:00",
    "boyPlaceOfBirth": "New Delhi, India",
    "boyLatitude": 28.6139,
    "boyLongitude": 77.209,
    "girlName": "Priya Patel",
    "girlDateOfBirth": "1997-08-20",
    "girlTimeOfBirth": "09:15:00",
    "girlPlaceOfBirth": "Mumbai, India",
    "girlLatitude": 19.076,
    "girlLongitude": 72.8777,
    "compatibilityScore": 75.0,
    "ashtakootDetails": { ... },
    "manglikDetails": { ... },
    "conclusion": "Excellent match! Very compatible for marriage.",
    "viewCount": 3,
    "lastViewedAt": "2026-09-18T12:00:00.000Z",
    "createdAt": "2026-09-18T10:00:00.000Z",
    "updatedAt": "2026-09-18T12:00:00.000Z"
  }
}
```

### Error Response (`404 Not Found`)

```json
{
  "success": false,
  "message": "Matching profile not found"
}
```

---

## 🗑️ 4. Delete Matching Profile

Deletes a saved Kundli matching profile by ID.

### HTTP Request

- **Method**: `DELETE`
- **URL**: `/api/kundli-matching/:matchingId`
- **Headers**:
  ```http
  Authorization: Bearer <your_user_jwt_token>
  ```

### Response Schema (`200 OK`)

```json
{
  "success": true,
  "message": "Matching profile deleted successfully"
}
```

### Error Response (`404 Not Found`)

```json
{
  "success": false,
  "message": "Matching profile not found"
}
```
