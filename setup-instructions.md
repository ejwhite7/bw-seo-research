# Supabase Database Setup Instructions

## Step 1: Get Database Password

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/rqbqtwjoulynmnilskfd
2. Navigate to **Settings** → **Database**
3. Scroll down to **Connection string** section
4. Copy the **Connection string** (it will look like: `postgresql://postgres:[YOUR-PASSWORD]@...`)
5. Note down the password part

## Step 2: Apply Database Schema

I'll create a simple script that you can run once you have the password.

### Option A: Using Supabase Dashboard (Recommended)

1. Go to: https://supabase.com/dashboard/project/rqbqtwjoulynmnilskfd/editor
2. Click on **SQL Editor**
3. Execute the following SQL files in order:

#### File 1: Initial Schema
```sql
-- Copy the entire content of supabase/migrations/001_initial_schema.sql
```

#### File 2: RLS Policies
```sql
-- Copy the entire content of supabase/migrations/002_rls_policies.sql
```

#### File 3: Performance Indexes
```sql
-- Copy the entire content of supabase/migrations/003_performance_indexes.sql
```

#### File 4: Security Enhancements
```sql
-- Copy the entire content of supabase/migrations/004_security_enhancements.sql
```

### Option B: Using Command Line (if you have the password)

Run this command with your actual database password:

```bash
export PATH="/opt/homebrew/opt/postgresql@14/bin:$PATH"
psql "postgresql://postgres:[YOUR-PASSWORD]@db.rqbqtwjoulynmnilskfd.supabase.co:5432/postgres" -f supabase/migrations/001_initial_schema.sql
psql "postgresql://postgres:[YOUR-PASSWORD]@db.rqbqtwjoulynmnilskfd.supabase.co:5432/postgres" -f supabase/migrations/002_rls_policies.sql
psql "postgresql://postgres:[YOUR-PASSWORD]@db.rqbqtwjoulynmnilskfd.supabase.co:5432/postgres" -f supabase/migrations/003_performance_indexes.sql
psql "postgresql://postgres:[YOUR-PASSWORD]@db.rqbqtwjoulynmnilskfd.supabase.co:5432/postgres" -f supabase/migrations/004_security_enhancements.sql
```

## Step 3: Update Vercel Environment Variables

After the database is set up, I'll add the following environment variables to Vercel:

- `SUPABASE_SERVICE_ROLE_KEY` (for server-side operations)
- `DATABASE_ENCRYPTION_KEY` (for encrypting stored API keys)

Would you like me to proceed with setting up the database using the dashboard method, or do you want to provide the database password for the command-line approach?