
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { supabase } from './src/supabase';

type Household = {
  id: string;
  name: string;
  invite_code: string;
};

type Task = {
  id: string;
  title: string;
  completed: boolean;
  created_at: string;
};

type ShoppingItem = {
  id: string;
  name: string;
  completed: boolean;
  created_at: string;
};

export default function App() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [itemName, setItemName] = useState('');

  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [tab, setTab] = useState<'tasks' | 'shopping'>('tasks');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadHousehold = useCallback(async (id: string) => {
    const { data: membership, error: memberError } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', id)
      .limit(1)
      .maybeSingle();

    if (memberError) throw memberError;

    if (!membership) {
      setHousehold(null);
      setTasks([]);
      setItems([]);
      return;
    }

    const { data: home, error: homeError } = await supabase
      .from('households')
      .select('id, name, invite_code')
      .eq('id', membership.household_id)
      .single();

    if (homeError) throw homeError;

    setHousehold(home as Household);
    await loadLists(home.id);
  }, []);

  const loadLists = async (householdId: string) => {
    const [taskResult, shoppingResult] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, completed, created_at')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false }),
      supabase
        .from('shopping_items')
        .select('id, name, completed, created_at')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false }),
    ]);

    if (taskResult.error) throw taskResult.error;
    if (shoppingResult.error) throw shoppingResult.error;

    setTasks((taskResult.data || []) as Task[]);
    setItems((shoppingResult.data || []) as ShoppingItem[]);
  };

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const user = data.session?.user;

        if (user && active) {
          setUserId(user.id);
          setSessionEmail(user.email ?? null);
          await loadHousehold(user.id);
        }
      } catch (e: any) {
        if (active) {
          Alert.alert('Error', e?.message ?? 'No se pudieron cargar tus datos.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const user = session?.user;

        setUserId(user?.id ?? null);
        setSessionEmail(user?.email ?? null);

        if (!user) {
          setHousehold(null);
          setTasks([]);
          setItems([]);
        } else {
          setTimeout(() => {
            if (active) {
              void loadHousehold(user.id).catch((e: any) => {
                Alert.alert(
                  'Error al cargar el hogar',
                  e?.message ?? 'Inténtalo de nuevo.'
                );
              });
            }
          }, 0);
        }
      }
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadHousehold]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e: any) {
      Alert.alert('Ups, algo pasó', e?.message ?? 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const signIn = () =>
    run(async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    });

  const signUp = () =>
    run(async () => {
      if (!displayName.trim()) {
        throw new Error('Escribe tu nombre para mostrar.');
      }
      if (password.length < 6) {
        throw new Error('La contraseña debe tener al menos 6 caracteres.');
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName.trim() },
        },
      });

      if (error) throw error;

      if (!data.session) {
        Alert.alert(
          'Revisa tu correo',
          'Confirma tu correo si Supabase te lo solicita y luego inicia sesión.'
        );
      }
    });

  const createFamily = () =>
    run(async () => {
      if (!familyName.trim()) {
        throw new Error('Escribe el nombre de la familia.');
      }

      const code = Math.random().toString(36).slice(2, 8).toUpperCase();

      const { error } = await supabase.rpc('create_household', {
        p_name: familyName.trim(),
        p_invite_code: code,
        p_display_name: displayName.trim() || email.split('@')[0],
      });

      if (error) throw error;
      if (!userId) throw new Error('Vuelve a iniciar sesión.');

      await loadHousehold(userId);

      Alert.alert(
        '¡Familia creada!',
        `Tu código familiar es ${code}. Compártelo con quienes quieras invitar.`
      );
    });

  const joinFamily = () =>
    run(async () => {
      if (!inviteCode.trim()) {
        throw new Error('Escribe el código familiar.');
      }

      const { error } = await supabase.rpc('join_household_by_code', {
        p_code: inviteCode.trim().toUpperCase(),
        p_display_name: displayName.trim() || email.split('@')[0],
      });

      if (error) throw error;
      if (!userId) throw new Error('Vuelve a iniciar sesión.');

      await loadHousehold(userId);

      Alert.alert('¡Listo!', 'Ya puedes ver el panel de tu hogar.');
    });

  const addTask = () =>
    run(async () => {
      if (!household || !userId) return;
      if (!taskTitle.trim()) {
        throw new Error('Escribe el nombre de la tarea.');
      }

      const { error } = await supabase.from('tasks').insert({
        household_id: household.id,
        title: taskTitle.trim(),
        created_by: userId,
        completed: false,
      });

      if (error) throw error;

      setTaskTitle('');
      await loadLists(household.id);
    });

  const toggleTask = (task: Task) =>
    run(async () => {
      if (!household) return;

      const { error } = await supabase
        .from('tasks')
        .update({ completed: !task.completed })
        .eq('id', task.id)
        .eq('household_id', household.id);

      if (error) throw error;
      await loadLists(household.id);
    });

  const addItem = () =>
    run(async () => {
      if (!household || !userId) return;
      if (!itemName.trim()) {
        throw new Error('Escribe el nombre del producto.');
      }

      const { error } = await supabase.from('shopping_items').insert({
        household_id: household.id,
        name: itemName.trim(),
        created_by: userId,
        completed: false,
      });

      if (error) throw error;

      setItemName('');
      await loadLists(household.id);
    });

  const toggleItem = (item: ShoppingItem) =>
    run(async () => {
      if (!household) return;

      const { error } = await supabase
        .from('shopping_items')
        .update({ completed: !item.completed })
        .eq('id', item.id)
        .eq('household_id', household.id);

      if (error) throw error;
      await loadLists(household.id);
    });

  const signOut = () =>
    run(async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    });

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator size="large" color="#315CE8" />
          <Text style={s.helper}>Cargando Hogar Feliz...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FB" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.brandRow}>
            <View style={s.logo}>
              <Text style={s.logoText}>⌂</Text>
            </View>
            <View>
              <Text style={s.brand}>Hogar Feliz</Text>
              <Text style={s.tagline}>Una casa, un equipo.</Text>
            </View>
          </View>

          {!sessionEmail ? (
            <View style={s.card}>
              <Text style={s.eyebrow}>BIENVENIDO A CASA</Text>
              <Text style={s.title}>
                {mode === 'signup' ? 'Crea tu cuenta' : 'Qué bueno verte'}
              </Text>
              <Text style={s.subtitle}>
                {mode === 'signup'
                  ? 'Organiza tu hogar en equipo.'
                  : 'Entra para organizar las tareas de casa.'}
              </Text>

              {mode === 'signup' && (
                <TextInput
                  style={s.input}
                  placeholder="Nombre para mostrar"
                  placeholderTextColor="#9299A8"
                  value={displayName}
                  onChangeText={setDisplayName}
                />
              )}

              <TextInput
                style={s.input}
                placeholder="Correo electrónico"
                placeholderTextColor="#9299A8"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />

              <TextInput
                style={s.input}
                placeholder="Contraseña (mínimo 6 caracteres)"
                placeholderTextColor="#9299A8"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              <TouchableOpacity
                style={s.primary}
                onPress={mode === 'signup' ? signUp : signIn}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.primaryText}>
                    {mode === 'signup'
                      ? 'Crear cuenta  →'
                      : 'Iniciar sesión  →'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  setMode(mode === 'signup' ? 'signin' : 'signup')
                }
                style={s.linkButton}
              >
                <Text style={s.link}>
                  {mode === 'signup'
                    ? 'Ya tengo cuenta · Iniciar sesión'
                    : '¿Primera vez aquí? Crear cuenta'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : household ? (
            <View style={s.card}>
              <Text style={s.eyebrow}>TU HOGAR</Text>
              <Text style={s.title}>{household.name}</Text>
              <Text style={s.subtitle}>
                Sesión iniciada como {sessionEmail}
              </Text>

              <View style={s.codeBox}>
                <Text style={s.codeLabel}>CÓDIGO FAMILIAR</Text>
                <Text style={s.code}>{household.invite_code}</Text>
                <Text style={s.helper}>
                  Comparte este código para invitar a tu familia.
                </Text>
              </View>

              <View style={s.tabs}>
                <TouchableOpacity
                  style={[s.tab, tab === 'tasks' && s.tabActive]}
                  onPress={() => setTab('tasks')}
                >
                  <Text
                    style={[
                      s.tabText,
                      tab === 'tasks' && s.tabTextActive,
                    ]}
                  >
                    ✓ Tareas ({tasks.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.tab, tab === 'shopping' && s.tabActive]}
                  onPress={() => setTab('shopping')}
                >
                  <Text
                    style={[
                      s.tabText,
                      tab === 'shopping' && s.tabTextActive,
                    ]}
                  >
                    🛒 Compras ({items.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {tab === 'tasks' ? (
                <>
                  <Text style={s.sectionTitle}>Tareas del hogar</Text>
                  <TextInput
                    style={s.input}
                    placeholder="Ej. Lavar los platos"
                    placeholderTextColor="#9299A8"
                    value={taskTitle}
                    onChangeText={setTaskTitle}
                  />
                  <TouchableOpacity
                    style={s.primary}
                    onPress={addTask}
                    disabled={busy}
                  >
                    <Text style={s.primaryText}>＋ Añadir tarea</Text>
                  </TouchableOpacity>

                  {tasks.length === 0 ? (
                    <Text style={s.empty}>
                      Aún no hay tareas. ¡Añade la primera!
                    </Text>
                  ) : (
                    tasks.map((task) => (
                      <TouchableOpacity
                        key={task.id}
                        style={s.listItem}
                        onPress={() => toggleTask(task)}
                      >
                        <Text
                          style={[
                            s.check,
                            task.completed && s.checkDone,
                          ]}
                        >
                          {task.completed ? '✓' : '○'}
                        </Text>
                        <Text
                          style={[
                            s.itemText,
                            task.completed && s.itemDone,
                          ]}
                        >
                          {task.title}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </>
              ) : (
                <>
                  <Text style={s.sectionTitle}>Lista de compras</Text>
                  <TextInput
                    style={s.input}
                    placeholder="Ej. Leche"
                    placeholderTextColor="#9299A8"
                    value={itemName}
                    onChangeText={setItemName}
                  />
                  <TouchableOpacity
                    style={s.primary}
                    onPress={addItem}
                    disabled={busy}
                  >
                    <Text style={s.primaryText}>＋ Añadir producto</Text>
                  </TouchableOpacity>

                  {items.length === 0 ? (
                    <Text style={s.empty}>
                      La lista está vacía. Añade lo que haga falta.
                    </Text>
                  ) : (
                    items.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={s.listItem}
                        onPress={() => toggleItem(item)}
                      >
                        <Text
                          style={[
                            s.check,
                            item.completed && s.checkDone,
                          ]}
                        >
                          {item.completed ? '✓' : '○'}
                        </Text>
                        <Text
                          style={[
                            s.itemText,
                            item.completed && s.itemDone,
                          ]}
                        >
                          {item.name}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </>
              )}

              <TouchableOpacity
                onPress={signOut}
                style={s.linkButton}
                disabled={busy}
              >
                <Text style={s.link}>Cerrar sesión</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.card}>
              <View style={s.successIcon}>
                <Text style={{ fontSize: 28, color: '#16834A' }}>✓</Text>
              </View>
              <Text style={s.title}>¡Hola!</Text>
              <Text style={s.subtitle}>
                Sesión iniciada como {sessionEmail}
              </Text>
              <Text style={s.sectionTitle}>Tu familia</Text>
              <Text style={s.helper}>
                Crea un hogar o únete con un código familiar.
              </Text>

              <TextInput
                style={s.input}
                placeholder="Nombre para mostrar"
                placeholderTextColor="#9299A8"
                value={displayName}
                onChangeText={setDisplayName}
              />
              <TextInput
                style={s.input}
                placeholder="Nombre de la familia"
                placeholderTextColor="#9299A8"
                value={familyName}
                onChangeText={setFamilyName}
              />
              <TouchableOpacity
                style={s.primary}
                onPress={createFamily}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.primaryText}>＋ Crear familia</Text>
                )}
              </TouchableOpacity>

              <View style={s.orLine}>
                <View style={s.line} />
                <Text style={s.orText}>O ÚNETE A UNA</Text>
                <View style={s.line} />
              </View>

              <TextInput
                style={s.input}
                placeholder="Código familiar"
                placeholderTextColor="#9299A8"
                autoCapitalize="characters"
                value={inviteCode}
                onChangeText={setInviteCode}
              />
              <TouchableOpacity
                style={s.secondary}
                onPress={joinFamily}
                disabled={busy}
              >
                <Text style={s.secondaryText}>Unirme con código</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={signOut}
                style={s.linkButton}
                disabled={busy}
              >
                <Text style={s.link}>Cerrar sesión</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={s.footer}>HECHO PARA VIVIR MEJOR EN EQUIPO</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FB' },
  container: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 34,
    paddingBottom: 28,
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: '#315CE8',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  logoText: {
    fontSize: 34,
    color: '#fff',
    fontWeight: '700',
    marginTop: -5,
  },
  brand: {
    color: '#17213A',
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: { color: '#79839A', fontSize: 13, marginTop: 2 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 26,
    padding: 23,
    borderWidth: 1,
    borderColor: '#E8ECF4',
    elevation: 3,
  },
  eyebrow: {
    color: '#315CE8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  title: {
    color: '#17213A',
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: '#7B8498',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 23,
  },
  input: {
    backgroundColor: '#F7F8FC',
    borderColor: '#E5E9F2',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 15,
    color: '#17213A',
    fontSize: 14,
    marginBottom: 12,
  },
  primary: {
    backgroundColor: '#315CE8',
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
    elevation: 2,
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondary: {
    borderRadius: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8E0F5',
    backgroundColor: '#F5F7FF',
  },
  secondaryText: { color: '#315CE8', fontSize: 15, fontWeight: '700' },
  linkButton: { alignItems: 'center', paddingVertical: 17 },
  link: {
    color: '#315CE8',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  footer: {
    textAlign: 'center',
    color: '#A2A9B8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 24,
  },
  successIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#E8F8EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#17213A',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 3,
    marginBottom: 10,
  },
  helper: {
    color: '#7B8498',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 15,
    marginTop: 8,
  },
  orLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 20,
  },
  line: { height: 1, backgroundColor: '#E9EDF4', flex: 1 },
  orText: {
    color: '#9AA2B3',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  codeBox: {
    backgroundColor: '#F2F5FF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    alignItems: 'center',
  },
  codeLabel: {
    color: '#79839A',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  code: {
    color: '#315CE8',
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: 3,
    marginTop: 7,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F3F5FA',
    padding: 4,
    borderRadius: 14,
    marginBottom: 22,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 11,
  },
  tabActive: { backgroundColor: '#315CE8' },
  tabText: { color: '#68738B', fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  empty: {
    color: '#8A93A6',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
    lineHeight: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F8FC',
    borderWidth: 1,
    borderColor: '#E9EDF4',
    borderRadius: 13,
    padding: 14,
    marginTop: 9,
  },
  check: {
    color: '#315CE8',
    fontSize: 22,
    fontWeight: '700',
    marginRight: 12,
  },
  checkDone: { color: '#16834A' },
  itemText: { color: '#17213A', fontSize: 14, flex: 1 },
  itemDone: { color: '#9AA2B3', textDecorationLine: 'line-through' },
});
