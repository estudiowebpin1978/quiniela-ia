SELECT pg_get_function_result(oid) as result_type, pg_get_function_arguments(oid) as args FROM pg_proc WHERE proname = 'check_rate_limit';
