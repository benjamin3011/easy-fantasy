# Sentry Integration Setup Guide

## 📊 Overview

Sentry has been integrated into Easy Fantasy for comprehensive error monitoring and performance tracking. This guide will help you configure Sentry for your project.

## 🚀 Quick Setup

### 1. Create Sentry Account & Project

1. Go to [sentry.io](https://sentry.io) and create an account
2. Create a new project and select "React" as the platform
3. Copy your DSN (Data Source Name) from the project settings

### 2. Environment Variables

Add these variables to your `.env.local` file:

```bash
# Sentry Configuration (Error Monitoring & Performance)
VITE_SENTRY_DSN=https://your_sentry_dsn@sentry.io/project_id
VITE_SENTRY_ENVIRONMENT=development
VITE_SENTRY_RELEASE=easy-fantasy@1.0.0
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
VITE_SENTRY_ENABLE_TRACING=true
VITE_SENTRY_ENABLE_REPLAY=false

# App Configuration
VITE_APP_VERSION=1.0.0
VITE_BUILD_TIME=2024-01-01T00:00:00Z
```

### 3. Production Configuration

For production, update these values:

```bash
VITE_SENTRY_ENVIRONMENT=production
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
VITE_SENTRY_ENABLE_TRACING=true
VITE_SENTRY_ENABLE_REPLAY=true
```

## 🔧 Configuration Options

| Variable | Description | Default | Recommended |
|----------|-------------|---------|-------------|
| `VITE_SENTRY_DSN` | Your Sentry project DSN | Required | Get from Sentry dashboard |
| `VITE_SENTRY_ENVIRONMENT` | Environment name | `development` | `development`/`production` |
| `VITE_SENTRY_RELEASE` | App version for tracking | `easy-fantasy@unknown` | `easy-fantasy@{version}` |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | Performance monitoring sample rate | `0.1` | `0.1` (10%) |
| `VITE_SENTRY_ENABLE_TRACING` | Enable performance monitoring | `true` | `true` |
| `VITE_SENTRY_ENABLE_REPLAY` | Enable session replay | `false` | `false` (dev), `true` (prod) |

## 📈 What's Being Monitored

### Error Tracking
- **JavaScript errors** with full stack traces
- **React component errors** via enhanced Error Boundary
- **Firebase operation errors** with context
- **Network request failures** with filtering
- **User action context** for debugging

### Performance Monitoring
- **Page load times** and route changes
- **Firebase query performance** with operation tracking
- **Bundle loading performance** with code splitting metrics
- **User interaction latency** tracking

### User Context
- **Authentication state** changes
- **User actions** and navigation patterns
- **Error recovery attempts** and success rates
- **Feature usage** patterns

## 🛠 Features Implemented

### Smart Error Filtering
- Filters out browser extension errors
- Ignores common network connectivity issues
- Categorizes errors for better triage
- Provides user-friendly error messages

### Performance Insights
- Tracks Firebase operation timing
- Monitors bundle loading performance
- Measures critical user flows
- Identifies performance bottlenecks

### User Experience Tracking
- Authentication flow monitoring
- Lineup creation performance
- Error recovery success rates
- Feature adoption metrics

## 🔍 Debugging Features

### Development Mode
- Detailed console logging with error categories
- Component stack traces for React errors
- Firebase operation breadcrumbs
- Performance timing logs

### Production Mode
- Filtered error reporting to reduce noise
- User-friendly error boundaries
- Automatic error recovery attempts
- Performance monitoring without overhead

## 📊 Sentry Dashboard Features

Once configured, you'll see:

### Issues Dashboard
- Error frequency and trends
- User impact analysis
- Stack trace analysis
- Release comparison

### Performance Dashboard
- Page load performance
- Firebase operation timing
- User flow analysis
- Performance regressions

### Release Tracking
- Error rates by release
- Performance impact of deployments
- Feature adoption tracking
- User satisfaction metrics

## 🚨 Error Categories

The system automatically categorizes errors:

- **🌐 Network**: Connection issues, API failures
- **📦 Chunk Load**: Code splitting failures, cache issues
- **🔒 Permission**: Authentication, authorization errors
- **🔥 Firebase**: Database, auth service issues
- **❓ Unknown**: Unexpected errors requiring investigation

## 🎯 Sample Rate Recommendations

### Development
```bash
VITE_SENTRY_TRACES_SAMPLE_RATE=1.0  # 100% for testing
VITE_SENTRY_ENABLE_REPLAY=false     # Avoid noise
```

### Staging
```bash
VITE_SENTRY_TRACES_SAMPLE_RATE=0.5  # 50% for thorough testing
VITE_SENTRY_ENABLE_REPLAY=true      # Test replay functionality
```

### Production
```bash
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% to balance insights vs. performance
VITE_SENTRY_ENABLE_REPLAY=true      # Enable for debugging production issues
```

## 🔐 Privacy & Security

### Data Filtering
- No personally identifiable information (PII) sent
- User emails are hashed for correlation
- Sensitive form data is masked
- Payment information is never captured

### Compliance
- GDPR compliant data handling
- User consent respected
- Data retention policies configured
- Regional data residency options

## 🚀 Getting Started

1. **Set up Sentry account** and get your DSN
2. **Add environment variables** to `.env.local`
3. **Test in development** - trigger an error to verify setup
4. **Deploy to production** with appropriate sample rates
5. **Monitor dashboard** for insights and alerts

## 📞 Support

If you need help with Sentry setup:
- Check the [Sentry React documentation](https://docs.sentry.io/platforms/javascript/guides/react/)
- Review error patterns in the dashboard
- Adjust sample rates based on usage
- Set up alerts for critical errors

---

**Note**: Sentry integration is already implemented in the codebase. You only need to configure the environment variables to start monitoring! 