# Deployment Guide: Frontend on Vercel & Backend on Render.com

This guide explains how to deploy the RenderSend application with the frontend on Vercel and the backend API on Render.com.

## Architecture Overview

- **Frontend**: React/Vite application (`packages/viewer`) deployed on Vercel
- **Backend**: Node.js/Hono API (`packages/api`) deployed on Render.com
- **Database**: Supabase (shared between both services)

## Prerequisites

- Vercel account
- Render.com account
- Supabase project
- GitHub repository with your code

## Backend Deployment (Render.com)

### 1. Prepare the Backend

The backend is already configured in `packages/api/` with:
- Hono framework
- Supabase integration
- TypeScript support

### 2. Create Render.com Service

1. Go to [Render.com](https://render.com) and sign in
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure the service:

**Basic Settings:**
- **Name**: rendersend-api (or your preferred name)
- **Root Directory**: `packages/api`
- **Runtime**: Node 20
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

**Environment Variables:**
```
NODE_ENV=production
SUPABASE_URL=your_supabase_url  # Required
SUPABASE_ANON_KEY=your_supabase_anon_key  # Optional, fallback for SERVICE_ROLE_KEY
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key  # Required
CORS_ORIGINS=https://your-app.vercel.app,http://localhost:5173  # Optional, defaults to "*"
```

5. Click **Create Web Service**

### 3. CORS Configuration

The API now uses environment variables for CORS configuration. Set `CORS_ORIGINS` to your frontend domains:

- **Development**: `http://localhost:5173`
- **Production**: `https://your-app.vercel.app`
- **Multiple origins**: Separate with commas: `https://your-app.vercel.app,http://localhost:5173`

If `CORS_ORIGINS` is not set, it defaults to `"*"` (allow all origins).

## Frontend Deployment (Vercel)

### 1. Prepare Environment Configuration

Create a new environment configuration for production:

```typescript
// In packages/viewer/src/config/api.ts
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
```

### 2. Update Vercel Configuration

Modify `vercel.json` to point to the Render.com backend:

```json
{
  "buildCommand": "pnpm build:viewer",
  "outputDirectory": "packages/viewer/dist",
  "installCommand": "pnpm install",
  "framework": "vite",
  "env": {
    "NODE_ENV": "production",
    "VITE_API_URL": "https://your-backend-url.onrender.com"
  }
}
```

### 3. Deploy to Vercel

1. Go to [Vercel](https://vercel.com) and sign in
2. Click **New Project**
3. Import your GitHub repository
4. Configure the project:

**Build Settings:**
- **Framework Preset**: Vite
- **Root Directory**: `.` (monorepo root)
- **Build Command**: `pnpm build:viewer`
- **Output Directory**: `packages/viewer/dist`

**Environment Variables:**
```
VITE_API_URL=https://your-backend-url.onrender.com
```

5. Click **Deploy**

## Alternative: Separate Repositories

If you prefer to maintain separate repositories:

### Backend Repository Structure
```
rendersend-api/
├── packages/api/
├── package.json
└── render.yaml
```

### Frontend Repository Structure
```
rendersend-frontend/
├── packages/viewer/
├── package.json
└── vercel.json
```

## Environment Variables Summary

### Backend (Render.com)
- `NODE_ENV`: production
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Your Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key
- `CORS_ORIGINS`: Comma-separated list of allowed origins (e.g., `https://your-app.vercel.app,http://localhost:5173`)

### Frontend (Vercel)
- `VITE_API_URL`: Your Render.com backend URL
- `NODE_ENV`: production

## Post-Deployment Checklist

- [ ] Backend API is accessible at its Render.com URL
- [ ] Frontend can make API calls to the backend
- [ ] CORS is properly configured
- [ ] Environment variables are correctly set
- [ ] Database connections work properly
- [ ] All API endpoints function correctly

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure the backend allows requests from your Vercel domain
2. **Environment Variables**: Double-check all variables are set correctly
3. **Build Failures**: Verify the build commands and dependencies
4. **Database Connection**: Ensure Supabase credentials are correct

### Debugging Commands

```bash
# Test backend locally
cd packages/api
npm run dev

# Test frontend locally with production backend
cd packages/viewer
VITE_API_URL=https://your-backend.onrender.com npm run dev
```

## Monitoring and Logs

- **Render.com**: Check the Logs tab in your service dashboard
- **Vercel**: Check the Logs tab in your project dashboard
- **Supabase**: Monitor database usage and API calls

## Scaling Considerations

- **Backend**: Render.com offers automatic scaling with paid plans
- **Frontend**: Vercel automatically scales based on traffic
- **Database**: Consider Supabase Pro tier for production workloads

## Security Notes

- Keep all API keys and secrets in environment variables
- Use HTTPS for all API communications
- Implement proper authentication and authorization
- Regularly update dependencies for security patches
