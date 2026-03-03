# Engage by Capstone

![Engage Logo](/frontend/public/images/engage-logo.svg)

**Professional proposal generation for UK accountants**

Engage is a revolutionary UK accounting proposal platform built for instant, compliant proposal generation. Create professional proposals in under 5 minutes with built-in MTD ITSA automation.

## 🎯 Key Features

- **⚡ Sub-5-minute proposal creation** - 6-24x faster than industry average
- **📱 Mobile-first responsive design** - Work from anywhere
- **🏢 Multi-tenancy architecture** - Manage multiple practices
- **🔐 Role-based access control** - Partner, Manager, Senior, Junior roles
- **📄 Professional PDF generation** - Print-ready proposals
- **💰 Intelligent pricing engine** - Prevent margin losses

### MTD ITSA Ready (April 2026)
- Automated income threshold assessment
- Quarterly deadline tracking
- Plain-language obligation explanation
- Pre-configured service packages

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+

### Installation

```bash
# Clone the repository
git clone https://github.com/capstone/engage.git
cd engage

# Install dependencies
npm install

# Setup environment
cp backend/.env.example backend/.env
# Edit backend/.env with your database credentials

# Run database migrations
cd backend
npx prisma migrate dev
npx prisma db seed

# Start development servers
cd ..
npm run dev:backend  # Terminal 1
npm run dev:frontend # Terminal 2
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Demo Credentials
- Email: `admin@demo.practice`
- Password: `DemoPass123!`

## 📁 Project Structure

```
engage/
├── backend/          # Node.js + Express API
├── frontend/         # React + TypeScript + Tailwind
├── shared/           # Shared types and utilities
└── docs/             # Documentation
```

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with refresh tokens

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with Capstone blue theme
- **State Management**: Zustand

## 📊 API Documentation

### Authentication
```
POST /api/auth/login          # Login with email/password
POST /api/auth/register       # Register new user
GET  /api/auth/me             # Get current user
```

### Proposals
```
GET    /api/proposals         # List proposals
POST   /api/proposals         # Create proposal
GET    /api/proposals/:id     # Get proposal details
```

### Clients
```
GET    /api/clients           # List clients
POST   /api/clients           # Create client
GET    /api/clients/:id       # Get client details
```

## 📝 License

MIT License - see LICENSE file for details

## 🙏 About Capstone

Engage is built by Capstone - providing innovative solutions for UK accounting professionals.

---

Built with ❤️ by Capstone
