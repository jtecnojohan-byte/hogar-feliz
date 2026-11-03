
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
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

type Household = {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
};

type Task = {
  id: string;
  title: string;
  completed: boolean;
  created_at: string;
  assigned_to?: string | null;
};

type HouseholdMember = { user_id: string; display_name: string };
type TaskSuggestion = { task: Task; member: HouseholdMember; score: number; reason: string };

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
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricPassword, setBiometricPassword] = useState('');

  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [tab, setTab] = useState<'tasks' | 'shopping'>('tasks');
  const [screen, setScreen] = useState<'home' | 'tasks' | 'shopping' | 'profile' | 'hogarbot'>('home');
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const t = (es: string, en: string) => language === 'es' ? es : en;

  useEffect(() => {
    SecureStore.getItemAsync('hogar-feliz-biometric-enabled').then((value) => setBiometricEnabled(value === 'true')).catch(() => setBiometricEnabled(false));
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync('hogar-feliz-language')
      .then((value) => { if (value === 'es' || value === 'en') setLanguage(value); })
      .catch(() => {});
  }, []);

  const signInWithBiometrics = () => run(async () => {
    const storedEmail = await SecureStore.getItemAsync('hogar-feliz-biometric-email');
    const storedPassword = await SecureStore.getItemAsync('hogar-feliz-biometric-password');
    if (!storedEmail || !storedPassword) {
      await SecureStore.deleteItemAsync('hogar-feliz-biometric-enabled');
      setBiometricEnabled(false);
      throw new Error(t('Vuelve a iniciar sesión con tu correo y contraseña para configurar la biometría.', 'Sign in with your email and password again to set up biometrics.'));
    }
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: t('Confirma tu identidad para entrar a Hogar Feliz', 'Verify your identity to sign in to Hogar Feliz'), cancelLabel: t('Cancelar', 'Cancel'), disableDeviceFallback: true });
    if (!result.success) return;
    const { data, error } = await supabase.auth.signInWithPassword({ email: storedEmail, password: storedPassword });
    if (error) throw error;
    const user = data.session?.user;
    if (!user) throw new Error(t('No se pudo iniciar sesión.', 'Could not sign in.'));
    setUserId(user.id);
    setSessionEmail(user.email ?? storedEmail);
    await loadHousehold(user.id);
  });

  const configureBiometrics = () => run(async () => {
    if (biometricEnabled) {
      await SecureStore.deleteItemAsync('hogar-feliz-biometric-enabled');
      await SecureStore.deleteItemAsync('hogar-feliz-biometric-email');
      await SecureStore.deleteItemAsync('hogar-feliz-biometric-password');
      setBiometricEnabled(false);
      setBiometricPassword('');
      Alert.alert(t('Biometría desactivada', 'Biometrics disabled'), t('Podrás seguir entrando con tu correo y contraseña.', 'You can continue signing in with your email and password.'));
      return;
    }
    if (!biometricPassword) throw new Error(t('Escribe tu contraseña actual para activar la biometría.', 'Enter your current password to enable biometrics.'));
    if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) throw new Error(t('Este dispositivo no tiene huella o reconocimiento facial configurado en Android.', 'This device has no fingerprint or face recognition configured in Android.'));
    const check = await LocalAuthentication.authenticateAsync({ promptMessage: t('Confirma tu identidad', 'Verify your identity'), cancelLabel: t('Cancelar', 'Cancel'), disableDeviceFallback: true });
    if (!check.success) return;
    const { data, error } = await supabase.auth.signInWithPassword({ email: sessionEmail ?? '', password: biometricPassword });
    if (error) throw error;
    const verifiedEmail = data.session?.user?.email;
    if (!verifiedEmail) throw new Error(t('No se pudo verificar tu cuenta.', 'Could not verify your account.'));
    await SecureStore.setItemAsync('hogar-feliz-biometric-email', verifiedEmail);
    await SecureStore.setItemAsync('hogar-feliz-biometric-password', biometricPassword);
    await SecureStore.setItemAsync('hogar-feliz-biometric-enabled', 'true');
    setBiometricEnabled(true);
    setBiometricPassword('');
    Alert.alert(t('Biometría activada', 'Biometrics enabled'), t('La próxima vez podrás iniciar sesión con tu huella o rostro.', 'Next time, you can sign in with your fingerprint or face.'));
  });

  const changeLanguage = async (next: 'es' | 'en') => {
    setLanguage(next);
    try { await SecureStore.setItemAsync('hogar-feliz-language', next); }
    catch { Alert.alert(t('Aviso', 'Notice'), t('No se pudo guardar el idioma en este dispositivo.', 'Could not save the language on this device.')); }
  };

  const changeEmail = () => run(async () => {
    const value = newEmail.trim().toLowerCase();
    if (!value || !value.includes('@')) throw new Error(t('Escribe un correo válido.', 'Enter a valid email address.'));
    const { error } = await supabase.auth.updateUser({ email: value });
    if (error) throw error;
    setNewEmail('');
    Alert.alert(t('Revisa tus correos', 'Check your inboxes'), t('Supabase enviará mensajes de confirmación según la configuración de seguridad del proyecto. El correo cambiará cuando completes la verificación.', 'Supabase will send confirmation messages according to your project security settings. Your email changes after verification.'));
  });

  const changePassword = () => run(async () => {
    if (newPassword.length < 8) throw new Error(t('La nueva contraseña debe tener al menos 8 caracteres.', 'Your new password must have at least 8 characters.'));
    if (newPassword !== confirmPassword) throw new Error(t('Las contraseñas no coinciden.', 'The passwords do not match.'));
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    if (biometricEnabled) await SecureStore.setItemAsync('hogar-feliz-biometric-password', newPassword);
    setNewPassword('');
    setConfirmPassword('');
    Alert.alert(t('Contraseña actualizada', 'Password updated'), t('Tu contraseña se cambió correctamente.', 'Your password was changed successfully.'));
  });

  const loadHousehold = useCallback(async (id: string, preferredHouseholdId?: string) => {
    let householdId = preferredHouseholdId;

    // Después de crear/unirse, usa directamente el UUID devuelto por la función RPC.
    // En inicios de sesión posteriores, recupera la membresía habitual.
    if (!householdId) {
      const { data: membership, error: memberError } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', id)
        .limit(1)
        .maybeSingle();

      if (memberError) throw memberError;

      if (!membership?.household_id) {
        setHousehold(null);
        setTasks([]);
        setItems([]);
        setMembers([]);
        return;
      }
      householdId = membership.household_id;
    }

    const { data: home, error: homeError } = await supabase
      .from('households')
      .select('id, name, invite_code, owner_id')
      .eq('id', householdId)
      .maybeSingle();

    if (homeError) throw homeError;
    if (!home) {
      throw new Error('El hogar se creó, pero no se pudo cargar. Revisa los permisos de lectura de households.');
    }

    setHousehold(home as Household);
    await Promise.all([loadLists(home.id), loadMembers(home.id)]);
  }, []);

  const loadMembers = async (householdId: string) => {
    const { data: membershipRows, error: memberError } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', householdId);
    if (memberError) throw memberError;
    const ids = (membershipRows || []).map((row: { user_id: string }) => row.user_id);
    if (!ids.length) { setMembers([]); return; }
    // Los perfiles pueden estar protegidos por RLS. La lista de membresías
    // sigue siendo suficiente para proponer tareas sin exponer datos privados.
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', ids);

    const namesById = new Map<string, string>();
    if (!profileError) {
      (profileRows || []).forEach((profile: { user_id: string; display_name: string | null }) => {
        namesById.set(profile.user_id, profile.display_name?.trim() || 'Integrante');
      });
    }

    setMembers(ids.map((memberId) => ({
      user_id: memberId,
      display_name: namesById.get(memberId) || 'Integrante',
    })));
  };

  const loadLists = async (householdId: string) => {
    const [taskResult, shoppingResult] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, completed, created_at, assigned_to')
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
          setMembers([]);
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      const user = data.session?.user;
      if (!user) throw new Error('No se pudo recuperar la sesión. Inténtalo otra vez.');
      setUserId(user.id);
      setSessionEmail(user.email ?? email.trim());
      await loadHousehold(user.id);
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

      const { data: householdId, error } = await supabase.rpc('create_household', {
        p_name: familyName.trim(),
        p_invite_code: code,
        p_display_name: displayName.trim() || email.split('@')[0],
      });

      if (error) throw error;
      if (!userId) throw new Error('Vuelve a iniciar sesión.');
      if (!householdId) throw new Error('La familia se creó, pero Supabase no devolvió su identificador.');

      await loadHousehold(userId, householdId as string);

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

      const { data: householdId, error } = await supabase.rpc('join_household_by_code', {
        p_code: inviteCode.trim().toUpperCase(),
        p_display_name: displayName.trim() || email.split('@')[0],
      });

      if (error) throw error;
      if (!userId) throw new Error('Vuelve a iniciar sesión.');
      if (!householdId) throw new Error('La unión se completó, pero Supabase no devolvió el identificador del hogar.');

      await loadHousehold(userId, householdId as string);

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

  const leaveHousehold = () => {
    if (!household || !userId) return;
    if (household.owner_id === userId) {
      Alert.alert(
        t('Eres quien administra este hogar', 'You manage this household'),
        t('Antes de salir, transfiere la propiedad a otro integrante. Así el hogar y sus datos no quedan sin administrador.', 'Before leaving, transfer ownership to another member so the household and its data keep an administrator.')
      );
      return;
    }
    Alert.alert(
      t('¿Salir de este hogar?', 'Leave this household?'),
      t('Dejarás de ver sus tareas y lista de compras. Los demás integrantes y los datos del hogar no se eliminarán.', 'You will no longer see its tasks or shopping list. Other members and household data will not be deleted.'),
      [
        { text: t('Cancelar', 'Cancel'), style: 'cancel' },
        { text: t('Salir del hogar', 'Leave household'), style: 'destructive', onPress: () => {
          void run(async () => {
            const { error } = await supabase
              .from('household_members')
              .delete()
              .eq('household_id', household.id)
              .eq('user_id', userId);
            if (error) throw error;
            setHousehold(null);
            setTasks([]);
            setItems([]);
            setScreen('home');
            Alert.alert(t('Ya saliste del hogar', 'You left the household'), t('Tu cuenta sigue activa. Puedes crear otro hogar o unirte con un código.', 'Your account is still active. You can create another household or join with a code.'));
          });
        }}
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ExpoStatusBar style="dark" />
        <View style={s.loadingWrap}>
          <View style={s.brandMark}><Text style={s.brandMarkText}>⌂</Text></View>
          <ActivityIndicator size="large" color="#247A58" />
          <Text style={s.helper}>Preparando tu hogar...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const completedTasks = tasks.filter((task) => task.completed).length;
  const pendingTasks = tasks.filter((task) => !task.completed);
  const assignedCounts = members.reduce<Record<string, number>>((counts, member) => {
    counts[member.user_id] = pendingTasks.filter((task) => task.assigned_to === member.user_id).length;
    return counts;
  }, {});
  // La carga virtual evita recomendar todas las tareas nuevas a la misma persona.
  // Sin historial de asignaciones ni preferencias, rotación y disponibilidad quedan neutrales.
  const virtualLoads = { ...assignedCounts };
  const unassignedTasks = pendingTasks.filter((task) => !task.assigned_to);
  const suggestions: TaskSuggestion[] = unassignedTasks.map((task) => {
    const ranked = members.map((member) => {
      const load = virtualLoads[member.user_id] || 0;
      const balanceScore = 100 / (1 + load);
      const rotationScore = 50;
      const availabilityScore = 50;
      const score = 0.5 * balanceScore + 0.3 * rotationScore + 0.2 * availabilityScore;
      return { member, score, load };
    }).sort((a, b) => b.score - a.score || a.load - b.load);
    const best = ranked[0];
    if (!best) return null;
    virtualLoads[best.member.user_id] = (virtualLoads[best.member.user_id] || 0) + 1;
    return {
      task,
      member: best.member,
      score: Math.round(best.score),
      reason: best.load === 0
        ? 'No tiene tareas pendientes asignadas; esta propuesta ayuda a repartir la carga.'
        : 'La propuesta considera su carga actual y distribuye las nuevas tareas entre el equipo.',
    };
  }).filter((value): value is TaskSuggestion => value !== null);
  const progress = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;

  const BottomNav = () => (
    <View style={s.bottomNav}>
      {([
        ['home', '⌂', t('Inicio', 'Home')],
        ['tasks', '✓', t('Tareas', 'Tasks')],
        ['shopping', '▤', t('Compras', 'Shopping')],
        ['profile', '◉', t('Perfil', 'Profile')],
      ] as const).map(([key, glyph, label]) => (
        <TouchableOpacity key={key} style={s.navItem} onPress={() => setScreen(key)}>
          <View style={[s.navIconWrap, screen === key && s.navIconActive]}>
            <Text style={[s.navGlyph, screen === key && s.navGlyphActive]}>{glyph}</Text>
          </View>
          <Text style={[s.navLabel, screen === key && s.navLabelActive]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" backgroundColor="#F6F8F5" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!sessionEmail ? (
          <ScrollView contentContainerStyle={s.authPage} keyboardShouldPersistTaps="handled">
            <View style={s.authBrand}>
              <View style={s.brandMark}><Text style={s.brandMarkText}>⌂</Text></View>
              <Text style={s.brand}>Hogar Feliz</Text>
              <Text style={s.tagline}>Una casa, un equipo.</Text>
            </View>
            <View style={s.authCard}>
              <Text style={s.eyebrow}>BIENVENIDO A CASA</Text>
              <Text style={s.authTitle}>{mode === 'signup' ? 'Tu hogar empieza aquí.' : 'Qué bueno verte.'}</Text>
              <Text style={s.subtitle}>{mode === 'signup' ? 'Crea tu cuenta y empieza a organizarte en equipo.' : 'Entra y pongamos todo en orden, juntos.'}</Text>
              {mode === 'signup' && <TextInput style={s.input} placeholder="Tu nombre" placeholderTextColor="#89948D" value={displayName} onChangeText={setDisplayName} />}
              <TextInput style={s.input} placeholder="Correo electrónico" placeholderTextColor="#89948D" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
              <TextInput style={s.input} placeholder="Contraseña (mínimo 6 caracteres)" placeholderTextColor="#89948D" secureTextEntry value={password} onChangeText={setPassword} />
              <TouchableOpacity style={s.primaryButton} onPress={mode === 'signup' ? signUp : signIn} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>{mode === 'signup' ? 'Crear mi cuenta  →' : 'Iniciar sesión  →'}</Text>}
              </TouchableOpacity>
              {mode === 'signin' && biometricEnabled && <TouchableOpacity style={[s.outlineButton, { marginTop: 12 }]} onPress={signInWithBiometrics} disabled={busy}><Text style={s.outlineButtonText}>{t('Entrar con huella o rostro', 'Sign in with fingerprint or face')}</Text></TouchableOpacity>}
              <TouchableOpacity onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')} style={s.authLinkWrap}>
                <Text style={s.link}>{mode === 'signup' ? 'Ya tengo cuenta · Iniciar sesión' : '¿Primera vez? Crear una cuenta'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.footer}>HECHO PARA VIVIR MEJOR EN EQUIPO</Text>
          </ScrollView>
        ) : !household ? (
          <ScrollView contentContainerStyle={s.setupPage} keyboardShouldPersistTaps="handled">
            <View style={s.setupTop}>
              <View style={s.brandMark}><Text style={s.brandMarkText}>⌂</Text></View>
              <Text style={s.brand}>Hogar Feliz</Text>
            </View>
            <View style={s.setupIntro}>
              <Text style={s.eyebrow}>UN NUEVO COMIENZO</Text>
              <Text style={s.authTitle}>Armemos tu equipo.</Text>
              <Text style={s.subtitle}>Crea el espacio de tu familia o únete con un código que te compartieron.</Text>
            </View>
            <View style={s.setupCard}>
              <Text style={s.sectionTitle}>Crear un hogar</Text>
              <TextInput style={s.input} placeholder="Tu nombre para mostrar" placeholderTextColor="#89948D" value={displayName} onChangeText={setDisplayName} />
              <TextInput style={s.input} placeholder="Nombre de la familia" placeholderTextColor="#89948D" value={familyName} onChangeText={setFamilyName} />
              <TouchableOpacity style={s.primaryButton} onPress={createFamily} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>＋ Crear hogar</Text>}
              </TouchableOpacity>
            </View>
            <View style={s.joinCard}>
              <Text style={s.sectionTitle}>¿Ya tienes un código?</Text>
              <TextInput style={s.input} placeholder="Escribe el código familiar" placeholderTextColor="#89948D" autoCapitalize="characters" value={inviteCode} onChangeText={setInviteCode} />
              <TouchableOpacity style={s.outlineButton} onPress={joinFamily} disabled={busy}>
                <Text style={s.outlineButtonText}>Unirme a un hogar  →</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={signOut} style={s.authLinkWrap}><Text style={s.link}>Cerrar sesión</Text></TouchableOpacity>
          </ScrollView>
        ) : (
          <>
            <ScrollView style={s.mainScroll} contentContainerStyle={s.mainContent} keyboardShouldPersistTaps="handled">
              <View style={s.topBar}>
                <View style={s.topBrand}>
                  <View style={s.smallBrandMark}><Text style={s.smallBrandMarkText}>⌂</Text></View>
                  <View>
                    <Text style={s.topBrandName}>Hogar Feliz</Text>
                    <Text style={s.topBrandCaption}>TU ESPACIO EN EQUIPO</Text>
                  </View>
                </View>
                <TouchableOpacity style={s.avatarButton} onPress={() => setScreen('profile')}>
                  <Text style={s.avatarText}>{(displayName || sessionEmail || 'H').charAt(0).toUpperCase()}</Text>
                </TouchableOpacity>
              </View>

              {screen === 'home' && (
                <>
                  <View style={s.welcomeBlock}>
                    <Text style={s.dateEyebrow}>TU RESUMEN FAMILIAR</Text>
                    <Text style={s.pageTitle}>¡Hola, {displayName.trim() || 'equipo'}! 👋</Text>
                    <Text style={s.pageSubtitle}>Un poquito cada uno hace la diferencia.</Text>
                  </View>
                  <View style={s.heroCard}>
                    <View style={s.heroTopRow}>
                      <View>
                        <Text style={s.heroKicker}>EL HOGAR DE HOY</Text>
                        <Text style={s.heroTitle}>{household.name}</Text>
                      </View>
                      <View style={s.heroHomeIcon}><Text style={s.heroHomeGlyph}>⌂</Text></View>
                    </View>
                    <View style={s.progressHeading}>
                      <Text style={s.progressTitle}>Progreso de tareas</Text>
                      <Text style={s.progressPercent}>{progress}%</Text>
                    </View>
                    <View style={s.progressTrack}><View style={[s.progressFill, { width: progress + '%' }]} /></View>
                    <Text style={s.progressCaption}>{completedTasks} de {tasks.length} tareas completadas</Text>
                  </View>
                  <View style={s.statsRow}>
                    <TouchableOpacity style={s.statCard} onPress={() => setScreen('tasks')}>
                      <View style={[s.statIcon, { backgroundColor: '#E7F3EA' }]}><Text style={s.statGlyph}>✓</Text></View>
                      <Text style={s.statNumber}>{tasks.length - completedTasks}</Text>
                      <Text style={s.statLabel}>Pendientes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.statCard} onPress={() => setScreen('shopping')}>
                      <View style={[s.statIcon, { backgroundColor: '#FFF1DA' }]}><Text style={[s.statGlyph, { color: '#B77920' }]}>▤</Text></View>
                      <Text style={s.statNumber}>{items.filter((item) => !item.completed).length}</Text>
                      <Text style={s.statLabel}>Por comprar</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={s.sectionHeader}>
                    <View><Text style={s.sectionTitle}>Lo que sigue</Text><Text style={s.sectionHint}>Las tareas más recientes</Text></View>
                    <TouchableOpacity onPress={() => setScreen('tasks')}><Text style={s.seeAll}>Ver todas  →</Text></TouchableOpacity>
                  </View>
                  {tasks.length === 0 ? (
                    <View style={s.emptyCard}><Text style={s.emptyIcon}>✦</Text><Text style={s.emptyTitle}>Todo empieza con una tarea</Text><Text style={s.emptyText}>Agrega la primera y organicen el día en familia.</Text><TouchableOpacity style={s.inlineAction} onPress={() => setScreen('tasks')}><Text style={s.inlineActionText}>Crear primera tarea  →</Text></TouchableOpacity></View>
                  ) : tasks.slice(0, 3).map((task) => (
                    <TouchableOpacity key={task.id} style={s.taskCard} onPress={() => toggleTask(task)}>
                      <View style={[s.taskCheck, task.completed && s.taskCheckDone]}><Text style={s.taskCheckText}>{task.completed ? '✓' : ''}</Text></View>
                      <View style={s.taskCopy}><Text style={[s.taskName, task.completed && s.taskNameDone]}>{task.title}</Text><Text style={s.taskMeta}>{task.completed ? 'Completada' : 'Pendiente'}</Text></View>
                      <Text style={s.taskArrow}>›</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={s.botEntryCard} onPress={() => setScreen('hogarbot')}>
                    <View style={s.botEntryIcon}><Text style={s.botEntryGlyph}>✦</Text></View>
                    <View style={s.taskCopy}><Text style={s.botEntryTitle}>Organiza con HogarBot</Text><Text style={s.taskMeta}>Recibe sugerencias para repartir las tareas.</Text></View>
                    <Text style={s.taskArrow}>›</Text>
                  </TouchableOpacity>
                  <View style={s.inviteStrip}>
                    <View style={s.inviteCopy}><Text style={s.inviteTitle}>¿Falta alguien en el equipo?</Text><Text style={s.inviteSubtitle}>Comparte el código familiar.</Text></View>
                    <TouchableOpacity style={s.inviteButton} onPress={() => setScreen('profile')}><Text style={s.inviteButtonText}>Ver código</Text></TouchableOpacity>
                  </View>
                </>
              )}

              {screen === 'tasks' && (
                <>
                  <View style={s.welcomeBlock}><Text style={s.dateEyebrow}>ORGANIZACIÓN DEL HOGAR</Text><Text style={s.pageTitle}>Tareas ✓</Text><Text style={s.pageSubtitle}>Cada pequeña ayuda cuenta.</Text></View>
                  <View style={s.addCard}><Text style={s.sectionTitle}>Nueva tarea</Text><TextInput style={s.input} placeholder="Ej. Lavar los platos" placeholderTextColor="#89948D" value={taskTitle} onChangeText={setTaskTitle} /><TouchableOpacity style={s.primaryButton} onPress={addTask} disabled={busy}><Text style={s.primaryButtonText}>＋ Añadir tarea</Text></TouchableOpacity></View>
                  <TouchableOpacity style={s.botEntryCard} onPress={() => setScreen('hogarbot')}>
                    <View style={s.botEntryIcon}><Text style={s.botEntryGlyph}>✦</Text></View>
                    <View style={s.taskCopy}><Text style={s.botEntryTitle}>Pedir ayuda a HogarBot</Text><Text style={s.taskMeta}>Revisar y distribuir tareas pendientes.</Text></View>
                    <Text style={s.taskArrow}>›</Text>
                  </TouchableOpacity>
                  <View style={s.sectionHeader}><View><Text style={s.sectionTitle}>Todas las tareas</Text><Text style={s.sectionHint}>{completedTasks} completadas · {tasks.length - completedTasks} pendientes</Text></View></View>
                  {tasks.length === 0 ? <View style={s.emptyCard}><Text style={s.emptyIcon}>✓</Text><Text style={s.emptyTitle}>Todavía no hay tareas</Text><Text style={s.emptyText}>Añade una arriba para empezar.</Text></View> : tasks.map((task) => <TouchableOpacity key={task.id} style={s.taskCard} onPress={() => toggleTask(task)}><View style={[s.taskCheck, task.completed && s.taskCheckDone]}><Text style={s.taskCheckText}>{task.completed ? '✓' : ''}</Text></View><View style={s.taskCopy}><Text style={[s.taskName, task.completed && s.taskNameDone]}>{task.title}</Text><Text style={s.taskMeta}>{task.completed ? 'Completada' : 'Toca para marcar como hecha'}</Text></View><Text style={s.taskArrow}>›</Text></TouchableOpacity>)}
                </>
              )}

              {screen === 'hogarbot' && (
                <>
                  <View style={s.welcomeBlock}>
                    <Text style={s.dateEyebrow}>ASISTENTE DE TAREAS · VERSIÓN INICIAL</Text>
                    <Text style={s.pageTitle}>HogarBot 🤖</Text>
                    <Text style={s.pageSubtitle}>Propuestas orientativas para repartir tareas de forma más equilibrada.</Text>
                  </View>
                  <View style={s.botHeroCard}>
                    <Text style={s.botHeroTitle}>Tu equipo, mejor organizado</Text>
                    <Text style={s.botHeroText}>Ponderación inicial: equilibrio de carga (50 %), rotación (30 %) y disponibilidad/preferencias (20 %). En esta versión, rotación y disponibilidad son neutrales porque aún no hay historial ni preferencias guardadas; las propuestas se distribuyen usando la carga actual.</Text>
                  </View>
                  <View style={s.sectionHeader}><View><Text style={s.sectionTitle}>Propuestas de asignación</Text><Text style={s.sectionHint}>{suggestions.length} tareas pendientes sin asignar · {members.length} integrantes</Text></View></View>
                  {members.length === 0 ? (
                    <View style={s.emptyCard}><Text style={s.emptyTitle}>No encontramos integrantes</Text><Text style={s.emptyText}>Revisa que los miembros del hogar tengan su perfil creado.</Text></View>
                  ) : suggestions.length === 0 ? (
                    <View style={s.emptyCard}><Text style={s.emptyIcon}>✓</Text><Text style={s.emptyTitle}>No hay propuestas por ahora</Text><Text style={s.emptyText}>Agrega tareas sin asignar para que HogarBot pueda sugerir una distribución.</Text></View>
                  ) : suggestions.map((suggestion) => (
                    <View key={suggestion.task.id} style={s.botSuggestionCard}>
                      <Text style={s.botTaskTitle}>{suggestion.task.title}</Text>
                      <Text style={s.botSuggestionText}>Sugerencia: {suggestion.member.display_name}</Text>
                      <Text style={s.sectionHint}>{suggestion.reason} Puntuación orientativa: {suggestion.score}/100.</Text>
                      <TouchableOpacity style={s.primaryButton} disabled={busy} onPress={() => run(async () => {
                        if (!household) return;
                        const { error } = await supabase.from('tasks').update({ assigned_to: suggestion.member.user_id }).eq('id', suggestion.task.id).eq('household_id', household.id).eq('completed', false).is('assigned_to', null);
                        if (error) throw error;
                        await loadLists(household.id);
                      })}><Text style={s.primaryButtonText}>Aceptar asignación</Text></TouchableOpacity>
                    </View>
                  ))}
                  <View style={s.botNoteCard}><Text style={s.botNoteTitle}>Así funciona esta versión</Text><Text style={s.botNoteText}>Esta versión usa la carga pendiente actual y reparte las propuestas de forma progresiva. La rotación histórica y la disponibilidad siguen neutrales hasta que existan datos. HogarBot solo propone tareas pendientes sin responsable; nada se asigna sin que alguien pulse “Aceptar asignación”.</Text></View>
                </>
              )}

              {screen === 'shopping' && (
                <>
                  <View style={s.welcomeBlock}><Text style={s.dateEyebrow}>LISTA COMPARTIDA</Text><Text style={s.pageTitle}>Compras ▤</Text><Text style={s.pageSubtitle}>Que no se quede nada por fuera.</Text></View>
                  <View style={s.addCard}><Text style={s.sectionTitle}>Agregar producto</Text><TextInput style={s.input} placeholder="Ej. Leche, arroz, huevos..." placeholderTextColor="#89948D" value={itemName} onChangeText={setItemName} /><TouchableOpacity style={s.primaryButton} onPress={addItem} disabled={busy}><Text style={s.primaryButtonText}>＋ Añadir a la lista</Text></TouchableOpacity></View>
                  <View style={s.sectionHeader}><View><Text style={s.sectionTitle}>Lista del hogar</Text><Text style={s.sectionHint}>{items.filter((item) => !item.completed).length} por comprar · {items.filter((item) => item.completed).length} listos</Text></View></View>
                  {items.length === 0 ? <View style={s.emptyCard}><Text style={s.emptyIcon}>▤</Text><Text style={s.emptyTitle}>Tu lista está vacía</Text><Text style={s.emptyText}>Agrega lo que necesitan comprar.</Text></View> : items.map((item) => <TouchableOpacity key={item.id} style={s.taskCard} onPress={() => toggleItem(item)}><View style={[s.taskCheck, item.completed && s.taskCheckDone]}><Text style={s.taskCheckText}>{item.completed ? '✓' : ''}</Text></View><View style={s.taskCopy}><Text style={[s.taskName, item.completed && s.taskNameDone]}>{item.name}</Text><Text style={s.taskMeta}>{item.completed ? 'Ya está en casa' : 'Pendiente de comprar'}</Text></View><Text style={s.taskArrow}>›</Text></TouchableOpacity>)}
                </>
              )}

              {screen === 'profile' && (
                <>
                  <View style={s.welcomeBlock}><Text style={s.dateEyebrow}>{t('TU CUENTA Y TU FAMILIA', 'YOUR ACCOUNT AND FAMILY')}</Text><Text style={s.pageTitle}>{t('Perfil', 'Profile')}</Text><Text style={s.pageSubtitle}>{t('Todo lo importante de tu hogar.', 'Everything important about your home.')}</Text></View>
                  <View style={s.profileCard}><View style={s.profileAvatar}><Text style={s.profileAvatarText}>{(displayName || sessionEmail || 'H').charAt(0).toUpperCase()}</Text></View><Text style={s.profileName}>{displayName.trim() || 'Integrante del hogar'}</Text><Text style={s.profileEmail}>{sessionEmail}</Text></View>
                  <View style={s.codeProfileCard}><Text style={s.heroKicker}>CÓDIGO PARA INVITAR</Text><Text style={s.codeProfile}>{household.invite_code}</Text><Text style={s.sectionHint}>Compártelo con las personas que quieras sumar a {household.name}.</Text></View>
                  <View style={s.profileInfo}><Text style={s.profileInfoLabel}>{t('MI HOGAR', 'MY HOUSEHOLD')}</Text><Text style={s.profileInfoValue}>{household.name}</Text></View>
                  <View style={s.settingsCard}>
                    <Text style={s.settingsTitle}>{t('⚙️ Configuración', '⚙️ Settings')}</Text>
                    {Platform.OS !== 'web' && <>
                      <Text style={s.settingsLabel}>{t('Inicio de sesión biométrico', 'Biometric sign-in')}</Text>
                      {biometricEnabled ? <Text style={s.sectionHint}>{t('Activado en este dispositivo.', 'Enabled on this device.')}</Text> : <><Text style={s.sectionHint}>{t('Usa la huella o el rostro de Android para iniciar sesión sin escribir tu contraseña.', 'Use Android fingerprint or face recognition to sign in without typing your password.')}</Text><TextInput style={s.input} placeholder={t('Contraseña actual para activar', 'Current password to enable')} placeholderTextColor="#89948D" secureTextEntry value={biometricPassword} onChangeText={setBiometricPassword} /></>}
                      <TouchableOpacity style={biometricEnabled ? s.leaveHouseholdButton : s.outlineButton} onPress={configureBiometrics} disabled={busy}><Text style={biometricEnabled ? s.leaveHouseholdText : s.outlineButtonText}>{biometricEnabled ? t('Desactivar biometría', 'Disable biometrics') : t('Activar huella o rostro', 'Enable fingerprint or face')}</Text></TouchableOpacity>
                    </>}
                    <Text style={[s.settingsLabel, { marginTop: 18 }]}>{t('Idioma', 'Language')}</Text>
                    <View style={s.languageRow}>
                      <TouchableOpacity style={[s.languageButton, language === 'es' && s.languageButtonActive]} onPress={() => changeLanguage('es')}><Text style={[s.languageButtonText, language === 'es' && s.languageButtonTextActive]}>Español</Text></TouchableOpacity>
                      <TouchableOpacity style={[s.languageButton, language === 'en' && s.languageButtonActive]} onPress={() => changeLanguage('en')}><Text style={[s.languageButtonText, language === 'en' && s.languageButtonTextActive]}>English</Text></TouchableOpacity>
                    </View>
                    <Text style={s.settingsLabel}>{t('Cambiar correo electrónico', 'Change email address')}</Text>
                    <TextInput style={s.input} placeholder={t('Nuevo correo electrónico', 'New email address')} placeholderTextColor="#89948D" autoCapitalize="none" keyboardType="email-address" value={newEmail} onChangeText={setNewEmail} />
                    <TouchableOpacity style={s.outlineButton} onPress={changeEmail} disabled={busy}><Text style={s.outlineButtonText}>{t('Actualizar correo', 'Update email')}</Text></TouchableOpacity>
                    <Text style={[s.settingsLabel, { marginTop: 20 }]}>{t('Cambiar contraseña', 'Change password')}</Text>
                    <TextInput style={s.input} placeholder={t('Nueva contraseña (mínimo 8 caracteres)', 'New password (at least 8 characters)')} placeholderTextColor="#89948D" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
                    <TextInput style={s.input} placeholder={t('Confirmar nueva contraseña', 'Confirm new password')} placeholderTextColor="#89948D" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
                    <TouchableOpacity style={s.primaryButton} onPress={changePassword} disabled={busy}><Text style={s.primaryButtonText}>{t('Guardar contraseña', 'Save password')}</Text></TouchableOpacity>
                  </View>
                  <TouchableOpacity style={s.leaveHouseholdButton} onPress={leaveHousehold} disabled={busy}><Text style={s.leaveHouseholdText}>{t('Salir del hogar', 'Leave household')}</Text></TouchableOpacity>
                  <TouchableOpacity style={s.logoutButton} onPress={signOut} disabled={busy}><Text style={s.logoutText}>Cerrar sesión</Text></TouchableOpacity>
                </>
              )}
              <Text style={s.footer}>HECHO PARA VIVIR MEJOR EN EQUIPO</Text>
            </ScrollView>
            <BottomNav />
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F8F5' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  brandMark: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#247A58', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#fff', fontSize: 42, fontWeight: '800', marginTop: -6 },
  authPage: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 48, paddingBottom: 36, width: '100%', maxWidth: 560, alignSelf: 'center' },
  authBrand: { alignItems: 'center', marginBottom: 32 },
  brand: { color: '#18372B', fontSize: 28, fontWeight: '900', letterSpacing: -0.8, marginTop: 14 },
  tagline: { color: '#7B8B80', fontSize: 14, marginTop: 5 },
  authCard: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24, borderWidth: 1, borderColor: '#E8EDE7' },
  eyebrow: { color: '#247A58', fontSize: 10, fontWeight: '900', letterSpacing: 1.8, marginBottom: 12 },
  authTitle: { color: '#18372B', fontSize: 31, lineHeight: 37, fontWeight: '900', letterSpacing: -1 },
  subtitle: { color: '#7B8B80', fontSize: 14, lineHeight: 21, marginTop: 9, marginBottom: 22 },
  input: { backgroundColor: '#F7F9F6', borderColor: '#E5EBE3', borderWidth: 1, borderRadius: 15, paddingHorizontal: 16, paddingVertical: 15, color: '#18372B', fontSize: 14, marginBottom: 12 },
  primaryButton: { backgroundColor: '#247A58', borderRadius: 16, minHeight: 54, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  authLinkWrap: { alignItems: 'center', paddingVertical: 18 },
  link: { color: '#247A58', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  footer: { color: '#9AA79D', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center', marginTop: 28, marginBottom: 8 },
  setupPage: { flexGrow: 1, padding: 22, paddingTop: 38, paddingBottom: 28, width: '100%', maxWidth: 680, alignSelf: 'center' },
  setupTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 34 },
  setupIntro: { marginBottom: 20 },
  setupCard: { backgroundColor: '#FFFFFF', borderRadius: 23, padding: 20, borderWidth: 1, borderColor: '#E8EDE7', marginBottom: 14 },
  joinCard: { backgroundColor: '#EDF4ED', borderRadius: 23, padding: 20 },
  sectionTitle: { color: '#18372B', fontSize: 18, fontWeight: '900', letterSpacing: -0.3, marginBottom: 7 },
  outlineButton: { borderWidth: 1.5, borderColor: '#247A58', borderRadius: 15, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  outlineButtonText: { color: '#247A58', fontSize: 14, fontWeight: '800' },
  mainScroll: { flex: 1 },
  mainContent: { paddingHorizontal: 21, paddingTop: 17, paddingBottom: 24, width: '100%', maxWidth: 960, alignSelf: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  topBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  smallBrandMark: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#247A58', alignItems: 'center', justifyContent: 'center' },
  smallBrandMarkText: { color: '#fff', fontSize: 27, fontWeight: '800', marginTop: -4 },
  topBrandName: { color: '#18372B', fontSize: 17, fontWeight: '900' },
  topBrandCaption: { color: '#94A198', fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 2 },
  avatarButton: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#DDECE0', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#247A58', fontSize: 17, fontWeight: '900' },
  welcomeBlock: { marginBottom: 21 },
  dateEyebrow: { color: '#8B9A8F', fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 8 },
  pageTitle: { color: '#18372B', fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  pageSubtitle: { color: '#819087', fontSize: 14, marginTop: 6 },
  heroCard: { backgroundColor: '#247A58', borderRadius: 25, padding: 21, marginBottom: 15 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  heroKicker: { color: '#D1E5D5', fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 7 },
  heroTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', letterSpacing: -0.5 },
  heroHomeIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  heroHomeGlyph: { color: '#FFFFFF', fontSize: 30, marginTop: -5 },
  progressHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  progressTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  progressPercent: { color: '#FFFFFF', fontSize: 19, fontWeight: '900' },
  progressTrack: { height: 8, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 10, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#D7F0C8', borderRadius: 10 },
  progressCaption: { color: '#D1E5D5', fontSize: 11, marginTop: 9 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 27 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#E9EEE7' },
  statIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  statGlyph: { color: '#247A58', fontSize: 18, fontWeight: '900' },
  statNumber: { color: '#18372B', fontSize: 25, fontWeight: '900' },
  statLabel: { color: '#87948B', fontSize: 11, marginTop: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13, marginTop: 3 },
  sectionHint: { color: '#8B9990', fontSize: 11, marginTop: 3, lineHeight: 16 },
  seeAll: { color: '#247A58', fontSize: 11, fontWeight: '900' },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 21, padding: 23, alignItems: 'center', borderWidth: 1, borderColor: '#E9EEE7' },
  emptyIcon: { color: '#247A58', fontSize: 28, marginBottom: 10 },
  emptyTitle: { color: '#18372B', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: '#89968D', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 6 },
  inlineAction: { paddingVertical: 12 },
  inlineActionText: { color: '#247A58', fontSize: 12, fontWeight: '900' },
  taskCard: { backgroundColor: '#FFFFFF', borderRadius: 17, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 9, borderWidth: 1, borderColor: '#E9EEE7' },
  taskCheck: { width: 25, height: 25, borderRadius: 9, borderWidth: 1.5, borderColor: '#B8C9BB', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  taskCheckDone: { backgroundColor: '#247A58', borderColor: '#247A58' },
  taskCheckText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  taskCopy: { flex: 1 },
  taskName: { color: '#253B30', fontSize: 13, fontWeight: '800' },
  taskNameDone: { color: '#9AA69D', textDecorationLine: 'line-through' },
  taskMeta: { color: '#9AA69D', fontSize: 10, marginTop: 4 },
  taskArrow: { color: '#A9B5AC', fontSize: 24, marginLeft: 8 },
  inviteStrip: { backgroundColor: '#EAF2E9', borderRadius: 19, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 17 },
  inviteCopy: { flex: 1, paddingRight: 8 },
  inviteTitle: { color: '#234333', fontSize: 12, fontWeight: '900' },
  inviteSubtitle: { color: '#819087', fontSize: 10, marginTop: 4 },
  inviteButton: { backgroundColor: '#FFFFFF', paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12 },
  inviteButtonText: { color: '#247A58', fontSize: 10, fontWeight: '900' },
  botEntryCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#DCE9DE' },
  botEntryIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#E6F1E7', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  botEntryGlyph: { color: '#247A58', fontSize: 22, fontWeight: '900' },
  botEntryTitle: { color: '#18372B', fontSize: 13, fontWeight: '900' },
  botHeroCard: { backgroundColor: '#E8F2E8', borderRadius: 22, padding: 19, marginBottom: 22 },
  botHeroTitle: { color: '#18372B', fontSize: 17, fontWeight: '900', marginBottom: 7 },
  botHeroText: { color: '#607568', fontSize: 12, lineHeight: 19 },
  botSuggestionCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 17, borderWidth: 1, borderColor: '#E9EEE7', marginBottom: 11 },
  botTaskTitle: { color: '#18372B', fontSize: 15, fontWeight: '900', marginBottom: 8 },
  botSuggestionText: { color: '#247A58', fontSize: 14, fontWeight: '800', marginBottom: 5 },
  botNoteCard: { backgroundColor: '#F0F3EF', borderRadius: 17, padding: 16, marginTop: 10 },
  botNoteTitle: { color: '#52675A', fontSize: 12, fontWeight: '900', marginBottom: 6 },
  botNoteText: { color: '#7B8B80', fontSize: 11, lineHeight: 17 },
  addCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, borderWidth: 1, borderColor: '#E9EEE7', marginBottom: 24 },
  profileCard: { backgroundColor: '#FFFFFF', borderRadius: 23, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#E9EEE7', marginBottom: 14 },
  profileAvatar: { width: 66, height: 66, borderRadius: 23, backgroundColor: '#DDECE0', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  profileAvatarText: { color: '#247A58', fontSize: 27, fontWeight: '900' },
  profileName: { color: '#18372B', fontSize: 18, fontWeight: '900' },
  profileEmail: { color: '#89968D', fontSize: 12, marginTop: 5 },
  codeProfileCard: { backgroundColor: '#247A58', borderRadius: 22, padding: 21, alignItems: 'center', marginBottom: 14 },
  codeProfile: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', letterSpacing: 4, marginVertical: 7 },
  profileInfo: { backgroundColor: '#FFFFFF', borderRadius: 17, padding: 17, borderWidth: 1, borderColor: '#E9EEE7' },
  profileInfoLabel: { color: '#95A198', fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginBottom: 7 },
  profileInfoValue: { color: '#18372B', fontSize: 15, fontWeight: '800' },
  settingsCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#E9EEE7', marginTop: 14 },
  settingsTitle: { color: '#18372B', fontSize: 18, fontWeight: '900', marginBottom: 17 },
  settingsLabel: { color: '#52675A', fontSize: 12, fontWeight: '800', marginBottom: 9, marginTop: 5 },
  languageRow: { flexDirection: 'row', gap: 10, marginBottom: 17 },
  languageButton: { flex: 1, borderWidth: 1, borderColor: '#DCE6DC', borderRadius: 13, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F9F6' },
  languageButtonActive: { backgroundColor: '#E6F1E7', borderColor: '#247A58' },
  languageButtonText: { color: '#7B8B80', fontSize: 13, fontWeight: '800' },
  languageButtonTextActive: { color: '#247A58' },
  leaveHouseholdButton: { minHeight: 52, borderRadius: 15, borderWidth: 1, borderColor: '#E5CFCB', alignItems: 'center', justifyContent: 'center', marginTop: 17, backgroundColor: '#FFF9F8' },
  leaveHouseholdText: { color: '#B65D50', fontSize: 13, fontWeight: '900' },
  logoutButton: { minHeight: 52, borderRadius: 15, borderWidth: 1, borderColor: '#E5CFCB', alignItems: 'center', justifyContent: 'center', marginTop: 17, backgroundColor: '#FFF9F8' },
  logoutText: { color: '#B65D50', fontSize: 13, fontWeight: '900' },
  bottomNav: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E9EEE7', paddingTop: 9, paddingBottom: Platform.OS === 'ios' ? 18 : 10, paddingHorizontal: 8 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navIconWrap: { width: 34, height: 29, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  navIconActive: { backgroundColor: '#E6F1E7' },
  navGlyph: { color: '#9AA79D', fontSize: 20, fontWeight: '800' },
  navGlyphActive: { color: '#247A58' },
  navLabel: { color: '#9AA79D', fontSize: 9, fontWeight: '700' },
  navLabelActive: { color: '#247A58', fontWeight: '900' },
});
