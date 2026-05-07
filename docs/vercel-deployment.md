# Vercel Deployment Guide

This guide covers deploying the RenderSend monorepo (frontend + backend) to a single Vercel project.

## Overview

RenderSend consists of:
- **Frontend**: React/Vite app in `packages/viewer`
- **Backend**: Hono API server in `packages/api`
- **Database**: Supabase
- **Package Manager**: pnpm with workspace support

## Prerequisites

- Vercel account
- GitHub/GitLab/Bitbucket repository
- Supabase project URL and service key
- Node.js 18+ and pnpm installed locally

## Step 1: Configure Vercel.json

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

## Step 2: Update API for Vercel Serverless

Modify `packages/api/src/server.ts` to work with Vercel:

```typescript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { config } from 'dotenv'

// Load environment variables
config({ path: '../../.env' })

const app = new Hono()

// Your existing routes
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Add your existing API routes here...

// Vercel serverless export
export default app

// Local development server
const port = Number(process.env.PORT) || 3001
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
```

## Step 3: Update Package Scripts

Ensure your root `package.json` has the correct build script:

```json
{
  "scripts": {
    "build": "pnpm --filter @rendersend/viewer build && pnpm --filter @rendersend/api build",
    "build:viewer": "pnpm --filter @rendersend/viewer build",
    "build:api": "pnpm --filter @rendersend/api build"
  }
}
```

## Step 4: Environment Variables

Set these in your Vercel dashboard under **Settings > Environment Variables**:

### Production Environment
```
NODE_ENV=production
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
DATABASE_URL=your_database_connection_string
```

### Preview Environment (optional)
```
NODE_ENV=production
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
DATABASE_URL=your_database_connection_string
```

## Step 5: Deploy to Vercel

### Option A: Via Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from project root
vercel

# Follow prompts to link to your Vercel account
```

### Option B: Via Vercel Dashboard
1. Go to [vercel.com](https://vercel.com)
2. Click "Add New..." → "Project"
3. Import your Git repository
4. Vercel will auto-detect your monorepo structure
5. Configure build settings (should match `vercel.json`)
6. Add environment variables
7. Click "Deploy"

## Step 6: Verify Deployment

### Health Checks
```bash
# Frontend
curl https://your-project.vercel.app

# API
curl https://your-project.vercel.app/api/health
```

### Common Endpoints to Test
- Frontend: `https://your-project.vercel.app`
- API Health: `https://your-project.vercel.app/api/health`
- API Routes: `https://your-project.vercel.app/api/your-endpoints`

## Troubleshooting

### Common Issues

**1. Build Failures**
```bash
# Check build logs in Vercel dashboard
# Ensure pnpm workspace is properly configured
# Verify all dependencies are in package.json
```

**2. API 404 Errors**
- Check `vercel.json` rewrites configuration
- Ensure API file path matches `functions` config
- Verify API exports default Hono app

**3. Environment Variables Missing**
- Double-check variable names in Vercel dashboard
- Ensure variables are set for correct environment (Production/Preview)
- Check `.env.example` for required variables

**4. Database Connection Issues**
- Verify Supabase URL and keys
- Check IP allowlist in Supabase settings
- Ensure connection string format is correct

### Debug Commands

```bash
# Local testing with production-like environment
NODE_ENV=production pnpm build
pnpm start

# Check Vercel deployment logs
vercel logs

# Inspect build output
ls -la packages/viewer/dist/
```

## Advanced Configuration

### Custom Domains
1. In Vercel dashboard, go to **Settings > Domains**
2. Add your custom domain
3. Configure DNS records as instructed
4. Update CORS settings if needed

### Performance Optimization
```json
// vercel.json additions
{
  "functions": {
    "packages/api/src/server.ts": {
      "runtime": "nodejs20.x",
      "maxDuration": 30,
      "memory": 512
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "s-maxage=60" }
      ]
    }
  ]
}
```

### Monorepo Specific Settings
```json
// vercel.json for monorepo optimization
{
  "buildCommand": "pnpm build",
  "installCommand": "pnpm install --shamefully-hoist",
  "framework": "vite",
  "outputDirectory": "packages/viewer/dist"
}
```

## Deployment Workflow

### Development
```bash
# Local development
pnpm dev

# Test build locally
pnpm build
```

### Staging (Preview Deployments)
- Push to feature branch → Automatic preview deployment
- Test in preview environment before merging

### Production
```bash
# Deploy to production
vercel --prod

# Or merge to main branch for auto-deployment
```

## Monitoring

### Vercel Analytics
- Enable in Vercel dashboard
- Monitor performance, errors, and usage

### Logging
```typescript
// Add structured logging to API
app.get('/api/test', (c) => {
  console.log('API call received:', {
    timestamp: new Date().toISOString(),
    method: c.req.method,
    path: c.req.path
  })
  return c.json({ message: 'success' })
})
```

## Security Considerations

1. **Environment Variables**: Never commit secrets to Git
2. **CORS**: Configure properly for your domain
3. **Rate Limiting**: Implement in API routes
4. **Database Access**: Use service role keys only on server-side

## Rollback Procedures

### Quick Rollback
```bash
# Rollback to previous deployment
vercel rollback [deployment-url]
```

### Emergency Rollback
1. Go to Vercel dashboard
2. Find previous successful deployment
3. Click "..." → "Promote to Production"

## Support Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Monorepo Guide](https://vercel.com/docs/concepts/projects/monorepos)
- [Hono on Vercel](https://hono.dev/getting-started/vercel)
- [RenderSend Repository](https://github.com/your-repo)

---

**Last Updated**: 2025-05-07
**Version**: 1.0.0
