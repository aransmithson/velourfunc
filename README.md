# VELOUR Proxy — Netlify Serverless Function

API proxy for AdultWork, deployed as a Netlify serverless function.

## Quick Deploy

1. Push this folder to a **GitHub repo**
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
3. Select your GitHub repo
4. Leave build settings as defaults (Netlify auto-detects `netlify.toml`)
5. Click **Deploy**

## Environment Variables

After deploy, go to **Site Settings → Environment Variables** and add:

| Name          | Value                          |
|---------------|--------------------------------|
| `API_KEY`     | Your AdultWork API key         |
| `API_SECRET`  | Your AdultWork API secret      |
| `ENVIRONMENT` | `sandbox` or `live`            |

Then **redeploy** (Deploys → Trigger deploy → Deploy site).

## Endpoints

Once deployed at `https://your-site.netlify.app`:

| Route                        | Method | Description              |
|------------------------------|--------|--------------------------|
| `/health`                    | GET    | Health check + cred info |
| `/api/lists/genders`         | GET    | Gender options           |
| `/api/lists/orientations`    | GET    | Orientation options      |
| `/api/lists/countries`       | GET    | Country options          |
| `/api/lists/regions?countryId=X` | GET | Region options       |
| `/api/search/profiles`       | POST   | Search profiles          |
| `/debug/raw?path=/Lists/GetGenders` | GET | Raw API debug     |
| `/debug/verify`              | GET    | Verify credentials       |

## Using with VELOUR Frontend

In the VELOUR app setup screen, enter your Netlify URL:
```
https://your-site.netlify.app
```

The endpoints are identical to the Cloudflare Worker version — no frontend changes needed.
