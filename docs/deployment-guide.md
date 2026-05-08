# Deployment Guide: RenderSend Monorepo

This guide explains how to deploy the RenderSend application with various deployment options.

## Architecture Overview

- **Frontend**: React/Vite application (`packages/viewer`) 
- **Backend**: Node.js/Hono API (`packages/api`)
- **Database**: Supabase
- **Package Manager**: pnpm workspace

## Deployment Options

### Option 1: Full Monorepo on Vercel (Recommended)
Deploy both frontend and backend to a single Vercel project using serverless functions.

### Option 2: Split Deployment
- Frontend on Vercel
- Backend on Render.com

This guide covers both options.

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
- **Root Directory**: `.` (monorepo root)
- **Runtime**: Node 20
- **Build Command**: `npm install -g pnpm && pnpm install && pnpm --filter @rendersend/api build`
- **Start Command**: `pnpm --filter @rendersend/api start`

**Environment Variables:**
```
NODE_ENV=production
SUPABASE_URL=your_supabase_url  # Required
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key  # Required
CORS_ORIGINS=https://your-app.vercel.app,http://localhost:5173  # Optional, defaults to "*"
RENDERSEND_OWNER_EMAIL=your-email@example.com  # Optional
```

5. Click **Create Web Service**

### 3. CORS Configuration

The API now uses environment variables for CORS configuration. Set `CORS_ORIGINS` to your frontend domains:

- **Development**: `http://localhost:5173`
- **Production**: `https://your-app.vercel.app`
- **Multiple origins**: Separate with commas: `https://your-app.vercel.app,http://localhost:5173`

If `CORS_ORIGINS` is not set, it defaults to `"*"` (allow all origins).

## Option 1: Full Monorepo on Vercel (Recommended)

### 1. Configure Vercel.json

Create `vercel.json` in your project root:

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "packages/viewer/dist",
  "installCommand": "pnpm install",
  "framework": "vite",
  "functions": {
    "packages/api/src/server.ts": {
      "runtime": "nodejs20.x",
      "maxDuration": 30
    }
  },
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/packages/api/src/server.ts"
    },
    {
      "source": "/(.*)",
      "destination": "/packages/viewer/dist/$1"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

### 2. Update API for Vercel Serverless

The API server is already configured for Vercel with environment variable validation and proper exports.

### 3. Deploy to Vercel

1. Go to [Vercel](https://vercel.com) and sign in
2. Click **New Project**
3. Import your GitHub repository
4. Configure the project:

**Build Settings:**
- **Framework Preset**: Vite
- **Root Directory**: `.` (monorepo root)
- **Build Command**: `pnpm build`
- **Output Directory**: `packages/viewer/dist`

**Environment Variables:**
```
NODE_ENV=production
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
CORS_ORIGINS=https://your-project.vercel.app
RENDERSEND_OWNER_EMAIL=your-email@example.com
```

5. Click **Deploy**

## Option 2: Split Deployment

### Frontend Deployment (Vercel)

### 1. Prepare Environment Configuration

Create a new environment configuration for production:

```typescript
// In packages/viewer/src/config/api.ts
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';
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

### Backend (Render.com or Vercel Functions)
- `NODE_ENV`: production
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (required)
- `CORS_ORIGINS`: Comma-separated list of allowed origins (e.g., `https://your-app.vercel.app,http://localhost:5173`)
- `RENDERSEND_OWNER_EMAIL`: Your email for CLI sharing (optional)

### Frontend (Vercel)
- `VITE_API_URL`: Your backend URL (for split deployment)
- `NODE_ENV`: production

### Environment Files
- `.env.example`: Template with placeholders
- `.env.production`: Production configuration

## Post-Deployment Checklist

### For Full Monorepo on Vercel
- [ ] API endpoints work at `/api/*` routes
- [ ] Frontend loads correctly at root path
- [ ] Environment variables are correctly set in Vercel dashboard
- [ ] Database connections work properly
- [ ] All API endpoints function correctly

### For Split Deployment
- [ ] Backend API is accessible at its Render.com URL
- [ ] Frontend can make API calls to the backend
- [ ] CORS is properly configured
- [ ] Environment variables are correctly set on both platforms
- [ ] Database connections work properly
- [ ] All API endpoints function correctly

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure the backend allows requests from your Vercel domain
2. **Environment Variables**: Double-check all variables are set correctly, especially `SUPABASE_SERVICE_ROLE_KEY`
3. **Build Failures**: Verify the build commands and dependencies
4. **Database Connection**: Ensure Supabase credentials are correct
5. **Missing Environment Variables**: The API now validates required variables and will fail fast if missing

### Debugging Commands

```bash
# Test backend locally
cd packages/api
pnpm dev

# Test backend with production environment
NODE_ENV=production pnpm dev:api

# Test frontend locally with production backend
cd packages/viewer
VITE_API_URL=https://your-backend.onrender.com pnpm dev

# Test full build locally
pnpm build
```

## Monitoring and Logs

- **Render.com**: Check the Logs tab in your service dashboard
- **Vercel**: Check the Logs tab in your project dashboard
- **Supabase**: Monitor database usage and API calls

## Scaling Considerations

- **Full Monorepo (Vercel)**: Serverless functions scale automatically
- **Split Deployment**: Render.com offers automatic scaling with paid plans
- **Frontend**: Vercel automatically scales based on traffic
- **Database**: Consider Supabase Pro tier for production workloads

## Security Notes

- Keep all API keys and secrets in environment variables
- Use HTTPS for all API communications
- Implement proper authentication and authorization
- Regularly update dependencies for security patches
- The API now validates environment variables to prevent misconfiguration

## Branch Deployment

### Deploying Different Branches

**In Vercel UI:**
1. Go to project settings
2. Select "Git" from the sidebar
3. Under "Production Branch", click "Edit"
4. Select your desired branch
5. Save changes

**For Preview Deployments:**
- Enable "Deploy all GitHub branches" in Git settings
- Each branch gets its own preview URL
- Production branch determines the main deployment

**Manual Branch Deployment:**
```bash
# Deploy specific branch
vercel --branch your-branch-name

# Deploy to production from specific branch
vercel --prod --branch your-branch-name
```
