# Engage by Capstone - Product Roadmap
**Vision:** Intuitive, Beautiful Proposal System for Accountancy Practices

---

## Current State vs Target State

### Current Workflow
1. Create proposal → Select client → Add services → Set prices → Send
2. Separate pages, many clicks
3. Basic UI, no theme options
4. Manual price adjustments

### Target Workflow
1. **Quick Client Access** → Select or create client
2. **Visual Service Builder** → Drag/drop or click services
3. **Smart Summary** → Auto-calculated totals, easy adjustments
4. **One-Click Send** → Email or link, instantly
5. **Client Journey** → View tracking → E-signature → Confirmation

---

## Phase 1: Foundation (Week 1)

### 1.1 Dark/Light Mode
- [ ] Theme toggle in header
- [ ] Tailwind dark mode configuration
- [ ] Persist preference
- [ ] All components themed

### 1.2 Design System
- [ ] Consistent color palette
- [ ] Typography scale
- [ ] Component library (cards, buttons, inputs)
- [ ] Animation/transition standards

---

## Phase 2: Proposal Creation Overhaul (Week 2-3)

### 2.1 New Proposal Flow
```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: SELECT CLIENT                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ 🔍 Search   │  │ + Create    │  │ Recent      │         │
│  │             │  │   New       │  │ Clients     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: BUILD SERVICES                                     │
│  ┌─────────────────────┐  ┌──────────────────────────────┐ │
│  │ SERVICE CATALOG     │  │ SELECTED SERVICES            │ │
│  │ 📁 Compliance       │  │                              │ │
│  │   ☐ Annual Accounts │  │ 1. Annual Accounts    £1,200 │ │
│  │   ☐ Tax Return      │  │ 2. VAT Returns         £300  │ │
│  │ 📁 Advisory         │  │                              │ │
│  │ 📁 Bookkeeping      │  │ [+ Add Custom Service]       │ │
│  └─────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: SUMMARY & ADJUST                                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Services                        Subtotal:   £1,500    │ │
│  │  ───────────────────────────────────────────────────── │ │
│  │  ☑ Annual Accounts        £1,200  [Edit] [Remove]     │ │
│  │  ☑ VAT Returns              £300  [Edit] [Remove]     │ │
│  │                                                        │ │
│  │  Discount: [-£150]  [VAT: 20%]  Total: £1,620        │ │
│  │                                                        │ │
│  │  [Preview] [Save Draft] [Send Proposal →]              │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Key Features
- [ ] **Service Catalog** - Visual categories, searchable
- [ ] **Quick Add** - One-click service addition
- [ ] **Inline Editing** - Adjust prices without leaving page
- [ ] **Real-time Totals** - Auto-calculate subtotal, VAT, total
- [ ] **Discount Controls** - Percentage or fixed amount
- [ ] **VAT Toggle** - Per-service or global VAT settings

---

## Phase 3: Sending & Tracking (Week 3-4)

### 3.1 Send Options
```
┌─────────────────────────────────────────────┐
│  SEND PROPOSAL                              │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ 📧 Send via Email                   │   │
│  │    [client@email.com      ] [Send]  │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ 🔗 Copy Shareable Link              │   │
│  │    https://engage.capstone.co.uk/   │   │
│  │    proposals/view/abc123            │   │
│  │    [Copy to Clipboard]              │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ 📄 Download PDF                     │   │
│  │    [Download Proposal PDF]          │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 3.2 Client View Tracking
- [ ] View counter (how many times opened)
- [ ] First view timestamp
- [ ] Last view timestamp
- [ ] IP address tracking

### 3.3 Notifications
- [ ] Email to practice when proposal viewed
- [ ] Email to practice when proposal signed
- [ ] Email to client with confirmation

---

## Phase 4: Polish & Enhancements (Week 4-5)

### 4.1 Attractive Cover Letter
- [ ] Professional template with logo
- [ ] Personalization variables
- [ ] Modern typography
- [ ] Color scheme matching branding

### 4.2 PDF Improvements
- [ ] Cover page with branding
- [ ] Table of contents
- [ ] Professional formatting
- [ ] Page numbers

### 4.3 Page Design Refresh
- [ ] Dashboard widgets
- [ ] Client list with avatars
- [ ] Proposal cards with status indicators
- [ ] Animated transitions

---

## Implementation Priority

### This Week (High Impact)
1. **Dark/Light Mode** - Quick win, modern feel
2. **New Proposal Builder** - Core workflow improvement
3. **Send Dialog** - Simplified sending

### Next Week
4. **View Tracking Enhancement** - Better analytics
5. **Email Notifications** - Complete the loop
6. **PDF Polish** - Professional output

### Following Week
7. **Page-by-page design refresh**
8. **Animation/transitions**
9. **Mobile responsiveness review**

---

## Design Principles

1. **Simplicity** - Fewer clicks, clearer paths
2. **Visual Feedback** - Loading states, success animations
3. **Consistency** - Same patterns across all pages
4. **Accessibility** - WCAG compliant, readable fonts
5. **Professional** - Clean, trustworthy appearance

---

## Technical Approach

### Frontend
- Tailwind CSS dark mode: `dark:` prefix classes
- React Context for theme state
- Framer Motion for animations
- Zustand for proposal builder state

### Backend
- Enhanced view tracking (count, timestamps)
- Email queue for notifications
- PDF generation with template system

---

*Roadmap created: 06 March 2026*
*Target completion: 4 weeks*
