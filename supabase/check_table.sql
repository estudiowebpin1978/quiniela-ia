SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rate_limits') as exists;
