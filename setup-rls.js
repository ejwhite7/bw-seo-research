const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'db.rqbqtwjoulynmnilskfd.supabase.co',
  database: 'postgres',
  password: 'udejjGqnEm85ep3',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

async function setupRLS() {
  console.log('🔒 Setting up Row Level Security policies...');

  const client = await pool.connect();

  try {
    // Enable RLS on all tables
    console.log('📋 Enabling RLS on all tables...');
    const tables = ['runs', 'clusters', 'keywords', 'competitors', 'roadmap_items', 'settings'];

    for (const table of tables) {
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      console.log(`✅ RLS enabled on ${table}`);
    }

    // Create policies for runs table
    console.log('🏃 Creating policies for runs table...');
    await client.query(`CREATE POLICY "Users can view their own runs" ON runs FOR SELECT USING (auth.uid() = user_id)`);
    await client.query(`CREATE POLICY "Users can insert their own runs" ON runs FOR INSERT WITH CHECK (auth.uid() = user_id)`);
    await client.query(`CREATE POLICY "Users can update their own runs" ON runs FOR UPDATE USING (auth.uid() = user_id)`);
    await client.query(`CREATE POLICY "Users can delete their own runs" ON runs FOR DELETE USING (auth.uid() = user_id)`);

    // Create policies for clusters table
    console.log('🔗 Creating policies for clusters table...');
    await client.query(`
      CREATE POLICY "Users can view clusters from their runs" ON clusters
      FOR SELECT USING (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = clusters.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);
    await client.query(`
      CREATE POLICY "Users can insert clusters for their runs" ON clusters
      FOR INSERT WITH CHECK (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = clusters.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);
    await client.query(`
      CREATE POLICY "Users can update clusters from their runs" ON clusters
      FOR UPDATE USING (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = clusters.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);
    await client.query(`
      CREATE POLICY "Users can delete clusters from their runs" ON clusters
      FOR DELETE USING (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = clusters.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);

    // Create policies for keywords table
    console.log('🔑 Creating policies for keywords table...');
    await client.query(`
      CREATE POLICY "Users can view keywords from their runs" ON keywords
      FOR SELECT USING (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = keywords.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);
    await client.query(`
      CREATE POLICY "Users can insert keywords for their runs" ON keywords
      FOR INSERT WITH CHECK (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = keywords.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);
    await client.query(`
      CREATE POLICY "Users can update keywords from their runs" ON keywords
      FOR UPDATE USING (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = keywords.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);
    await client.query(`
      CREATE POLICY "Users can delete keywords from their runs" ON keywords
      FOR DELETE USING (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = keywords.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);

    // Create policies for competitors table
    console.log('🏢 Creating policies for competitors table...');
    await client.query(`
      CREATE POLICY "Users can view competitors from their runs" ON competitors
      FOR SELECT USING (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = competitors.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);
    await client.query(`
      CREATE POLICY "Users can insert competitors for their runs" ON competitors
      FOR INSERT WITH CHECK (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = competitors.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);
    await client.query(`
      CREATE POLICY "Users can update competitors from their runs" ON competitors
      FOR UPDATE USING (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = competitors.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);
    await client.query(`
      CREATE POLICY "Users can delete competitors from their runs" ON competitors
      FOR DELETE USING (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = competitors.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);

    // Create policies for roadmap_items table
    console.log('🗺️ Creating policies for roadmap_items table...');
    await client.query(`
      CREATE POLICY "Users can view roadmap items from their runs" ON roadmap_items
      FOR SELECT USING (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = roadmap_items.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);
    await client.query(`
      CREATE POLICY "Users can insert roadmap items for their runs" ON roadmap_items
      FOR INSERT WITH CHECK (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = roadmap_items.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);
    await client.query(`
      CREATE POLICY "Users can update roadmap items from their runs" ON roadmap_items
      FOR UPDATE USING (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = roadmap_items.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);
    await client.query(`
      CREATE POLICY "Users can delete roadmap items from their runs" ON roadmap_items
      FOR DELETE USING (
          EXISTS (
              SELECT 1 FROM runs r
              WHERE r.id = roadmap_items.run_id
              AND r.user_id = auth.uid()
          )
      )
    `);

    // Create policies for settings table
    console.log('⚙️ Creating policies for settings table...');
    await client.query(`CREATE POLICY "Users can view their own settings" ON settings FOR SELECT USING (auth.uid() = user_id)`);
    await client.query(`CREATE POLICY "Users can insert their own settings" ON settings FOR INSERT WITH CHECK (auth.uid() = user_id)`);
    await client.query(`CREATE POLICY "Users can update their own settings" ON settings FOR UPDATE USING (auth.uid() = user_id)`);
    await client.query(`CREATE POLICY "Users can delete their own settings" ON settings FOR DELETE USING (auth.uid() = user_id)`);

    // Grant permissions to service role
    console.log('🔑 Granting permissions to service role...');
    await client.query('GRANT USAGE ON SCHEMA public TO service_role');
    await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role');
    await client.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role');
    await client.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role');

    console.log('✅ Row Level Security policies configured successfully!');

  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('⚠️ Some policies already exist, continuing...');
    } else {
      console.error('❌ Error setting up RLS:', error.message);
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

setupRLS().catch(console.error);