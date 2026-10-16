import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user) return json({ error: 'Сессия администратора недействительна. Войдите снова.' }, 401);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: me, error: profileError } = await admin
      .from('profiles')
      .select('id,role,active')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileError) return json({ error: `Не удалось проверить профиль администратора: ${profileError.message}` }, 500);
    if (!me || me.role !== 'admin' || !me.active) return json({ error: 'Только активный администратор может управлять пользователями.' }, 403);

    const b = await req.json();
    const domain = 'sklad.internal';

    const loadTarget = async () => {
      const { data } = await admin.from('profiles').select('id,role').eq('id', b.id).single();
      return data;
    };

    const countAdmins = async (excludeId?: string) => {
      let q = admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('active', true);
      if (excludeId) q = q.neq('id', excludeId);
      const { count } = await q;
      return count ?? 0;
    };

    switch (b.action) {
      case 'list': {
        const { data, error } = await admin.from('profiles')
          .select('id,login,full_name,role,active,created_at').order('created_at');
        if (error) return json({ error: error.message }, 400);
        return json({ users: data });
      }
      case 'create': {
        const login = String(b.login ?? '').trim().toLowerCase();
        const password = String(b.password ?? '');
        const fullName = String(b.full_name ?? '').trim();
        const role = ['admin', 'manager', 'supervisor'].includes(String(b.role)) ? String(b.role) : 'supervisor';
        if (!/^[a-z0-9._-]{3,32}$/.test(login)) return json({ error: 'Логин: 3–32 символа a-z, 0-9, . _ -' }, 400);
        if (password.length < 8) return json({ error: 'Пароль не короче 8 символов' }, 400);
        if (!fullName) return json({ error: 'Укажите имя' }, 400);
        const { data: created, error } = await admin.auth.admin.createUser({
          email: `${login}@${domain}`, password, email_confirm: true,
        });
        if (error || !created.user) {
          const message = error?.message?.toLowerCase().includes('already')
            ? 'Этот логин уже занят.'
            : error?.message ?? 'Не удалось создать пользователя.';
          return json({ error: message }, 400);
        }
        const { error: pe } = await admin.from('profiles').insert({
          id: created.user.id, login, full_name: fullName, role,
        });
        if (pe) {
          await admin.auth.admin.deleteUser(created.user.id);
          return json({ error: `Пользователь создан, но профиль не сохранён: ${pe.message}` }, 400);
        }
        return json({ id: created.user.id, login });
      }
      case 'set_password': {
        const target = await loadTarget();
        if (!target) return json({ error: 'Пользователь не найден' }, 404);
        if (String(b.password ?? '').length < 8) return json({ error: 'Пароль не короче 8 символов' }, 400);
        const { error } = await admin.auth.admin.updateUserById(b.id, { password: b.password });
        return error ? json({ error: error.message }, 400) : json({ ok: true });
      }
      case 'set_active': {
        const target = await loadTarget();
        if (!target) return json({ error: 'Пользователь не найден' }, 404);
        const active = !!b.active;
        if (!active && target.id === me.id) return json({ error: 'self' }, 400);
        if (!active && target.role === 'admin' && (await countAdmins(target.id)) === 0) return json({ error: 'last_admin' }, 400);
        const { error } = await admin.auth.admin.updateUserById(b.id, { ban_duration: active ? 'none' : '876000h' });
        if (error) return json({ error: error.message }, 400);
        await admin.from('profiles').update({ active }).eq('id', b.id);
        return json({ ok: true });
      }
      case 'rename': {
        const target = await loadTarget();
        if (!target) return json({ error: 'Пользователь не найден' }, 404);
        await admin.from('profiles').update({ full_name: String(b.full_name ?? '').trim() }).eq('id', b.id);
        return json({ ok: true });
      }
      case 'delete': {
        const target = await loadTarget();
        if (!target) return json({ error: 'Пользователь не найден' }, 404);
        if (target.id === me.id) return json({ error: 'self' }, 400);
        if (target.role === 'admin' && (await countAdmins(target.id)) === 0) return json({ error: 'last_admin' }, 400);
        const { error } = await admin.auth.admin.deleteUser(b.id);
        return error ? json({ error: error.message }, 400) : json({ ok: true });
      }
      default:
        return json({ error: 'Неизвестное действие' }, 400);
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
