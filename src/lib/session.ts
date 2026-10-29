import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, UserRole } from '@/domain/types';

const DEMO_USERS: { user_id: string; role: UserRole; full_name: string }[] = [
  { user_id: 'USR-0001', role: 'BUSINESS_REQUESTER', full_name: 'Avery Chen' },
  { user_id: 'USR-0002', role: 'BUSINESS_REQUESTER', full_name: 'Jordan Patel' },
  { user_id: 'USR-0003', role: 'PROCESS_OWNER', full_name: 'Riley Okafor' },
  { user_id: 'USR-0004', role: 'APPROVER', full_name: 'Morgan Reyes' },
  { user_id: 'USR-0005', role: 'APPROVER', full_name: 'Sam Delgado' },
  { user_id: 'USR-0006', role: 'OPERATIONS_ANALYST', full_name: 'Taylor Brooks' },
  { user_id: 'USR-0007', role: 'OPERATIONS_ANALYST', full_name: 'Casey Nguyen' },
  { user_id: 'USR-0008', role: 'SYSTEM_ADMIN', full_name: 'Drew Iverson' },
];

interface SessionState {
  user: User | null;
  loading: boolean;
}

export function useSession() {
  const [state, setState] = useState<SessionState>({ user: null, loading: true });

  const loadUser = useCallback(async (userId: string | null) => {
    if (!userId) {
      setState({ user: null, loading: false });
      return;
    }
    const { data, error } = await supabase.from('users').select('*').eq('user_id', userId).maybeSingle();
    if (error || !data) {
      setState({ user: null, loading: false });
      return;
    }
    setState({ user: data as User, loading: false });
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('invoiceflow_user_id');
    if (stored) {
      loadUser(stored);
    } else {
      // default to Operations Analyst for demo
      localStorage.setItem('invoiceflow_user_id', 'USR-0006');
      loadUser('USR-0006');
    }
  }, [loadUser]);

  const switchUser = useCallback(
    (userId: string) => {
      localStorage.setItem('invoiceflow_user_id', userId);
      loadUser(userId);
    },
    [loadUser],
  );

  return { ...state, switchUser, demoUsers: DEMO_USERS };
}
