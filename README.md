# Task Management - Elevator Service

Σύστημα διαχείρισης ασανσέρ, εργασιών και ραντεβού.

## Features

- **Authentication**: Login/Signup με Supabase Auth
- **Dashboard**: Συνοπτική εικόνα (stats, πρόσφατες εργασίες)
- **Ασανσέρ**: Καρτέλα ανά ασανσέρ (διεύθυνση, τηλέφωνο, επαφή, μηνιαίο κόστος, πιστοποίηση, ιστορικό επισκευών)
- **Εργασίες**: CRUD με προτεραιότητες (SOS/Urgent/Normal), ανάθεση σε τεχνικό, προθεσμίες
- **Ραντεβού**: Μηνιαία προβολή, ομαδοποίηση ανά ημέρα
- **Ομάδα**: Διαχείριση μελών, ρόλοι (admin/technician)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Setup Supabase

1. Δημιούργησε νέο project στο [Supabase](https://supabase.com)
2. Αντέγραψε το `.env.local.example` σε `.env.local` και συμπλήρωσε τα keys
3. Τρέξε το SQL schema στο Supabase SQL Editor:

```bash
# Αντέγραψε τα περιεχόμενα του scripts/schema.sql
# στο Supabase Dashboard → SQL Editor → New Query → Run
```

### 3. Run

```bash
npm run dev
```

## Database Schema

- **profiles** - User profiles (extends auth.users)
- **elevators** - Ασανσέρ με στοιχεία επαφής, πιστοποίηση, μηνιαίο κόστος
- **tasks** - Εργασίες με priority (SOS/urgent/normal), status, ανάθεση
- **repair_history** - Ιστορικό επισκευών ανά ασανσέρ
- **appointments** - Ραντεβού με ημερομηνία, διάρκεια, ανάθεση

## Tech Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS 4**
- **Supabase** (Auth + PostgreSQL + RLS)
