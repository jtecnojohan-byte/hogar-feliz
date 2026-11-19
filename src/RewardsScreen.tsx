import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';

type Props = {
  householdId: string;
  language: 'es' | 'en';
  onBack: () => void;
};

type Challenge = { id: string; title: string; description: string | null; created_at: string };

export function RewardsScreen({ householdId, language, onBack }: Props) {
  const isEs = language === 'es';
  const t = (es: string, en: string) => isEs ? es : en;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activeGuardians, setActiveGuardians] = useState(0);
  const [pendingGuardians, setPendingGuardians] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [approvedRequests, setApprovedRequests] = useState(0);

  const loadRewards = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError('');
    try {
      const [premiumResult, challengeResult, guardianResult, requestResult] = await Promise.all([
        supabase.from('household_premium').select('expires_at').eq('household_id', householdId).maybeSingle(),
        supabase.from('rewards_challenges').select('id, title, description, created_at')
          .eq('household_id', householdId).eq('active', true).order('created_at', { ascending: false }),
        supabase.from('household_guardians').select('user_id, status').eq('household_id', householdId),
        supabase.from('reward_requests').select('id, status').eq('household_id', householdId),
      ]);
      if (premiumResult.error) throw premiumResult.error;
      if (challengeResult.error) throw challengeResult.error;
      if (guardianResult.error) throw guardianResult.error;
      if (requestResult.error) throw requestResult.error;

      setExpiresAt((premiumResult.data as { expires_at: string | null } | null)?.expires_at ?? null);
      setChallenges((challengeResult.data || []) as Challenge[]);
      const guardians = guardianResult.data || [];
      setActiveGuardians(guardians.filter((row: any) => row.status === 'active').length);
      setPendingGuardians(guardians.filter((row: any) => row.status === 'pending').length);
      const requests = requestResult.data || [];
      setPendingRequests(requests.filter((row: any) => row.status === 'pending').length);
      setApprovedRequests(requests.filter((row: any) => row.status === 'approved').length);
    } catch (e: any) {
      setError(e?.message || t('No se pudo cargar Rewards.', 'Could not load Rewards.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [householdId, isEs]);

  useEffect(() => {
    void loadRewards();
  }, [loadRewards]);

  const activePremium = !!expiresAt && new Date(expiresAt).getTime() > Date.now();
  const daysRemaining = activePremium ? Math.max(1, Math.ceil((new Date(expiresAt as string).getTime() - Date.now()) / 86400000)) : 0;
  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString(isEs ? 'es-CO' : 'en-US', { dateStyle: 'medium' })
    : '';

  if (loading) {
    return <View style={s.loading}><ActivityIndicator size="large" color="#247A58" /><Text style={s.muted}>{t('Cargando Rewards...', 'Loading Rewards...')}</Text></View>;
  }

  return (
    <View>
      <TouchableOpacity style={s.backButton} onPress={onBack}><Text style={s.backText}>‹  {t('Volver a Inicio', 'Back to Home')}</Text></TouchableOpacity>
      <View style={s.heading}>
        <Text style={s.eyebrow}>HOGAR FELIZ · REWARDS V1.0</Text>
        <Text style={s.title}>Rewards ⭐</Text>
        <Text style={s.subtitle}>{t('Recompensas compartidas para todo el hogar.', 'Shared rewards for the whole household.')}</Text>
      </View>

      <View style={s.premiumCard}>
        <Text style={s.premiumEyebrow}>{t('PREMIUM DEL HOGAR', 'HOUSEHOLD PREMIUM')}</Text>
        <Text style={s.premiumTitle}>{activePremium ? t('¡Premium está activo!', 'Premium is active!') : t('Aún no hay Premium activo', 'No active Premium yet')}</Text>
        {activePremium ? (
          <>
            <Text style={s.premiumDays}>{daysRemaining} {t('días restantes', 'days remaining')}</Text>
            <Text style={s.premiumMeta}>{t('Vence el', 'Expires on')} {expiryLabel}</Text>
          </>
        ) : (
          <Text style={s.premiumMeta}>{expiresAt ? t('El periodo anterior terminó el', 'The previous period ended on') + ' ' + expiryLabel : t('Cuando un adulto autorizado consiga una recompensa, los días se sumarán aquí.', 'When an authorized adult earns a reward, the days will appear here.')}</Text>
        )}
        <Text style={s.sharedNote}>{t('Los días Premium se comparten con todos los integrantes del hogar, también con los menores.', 'Premium days are shared with every household member, including minors.')}</Text>
      </View>

      <View style={s.noticeCard}>
        <Text style={s.noticeTitle}>{t('Participación exclusiva para adultos', 'Adults-only participation')}</Text>
        <Text style={s.noticeText}>{t('Rewards está reservado para personas de 18 años o más. Si eres menor, no solicites acceso ni declares ser adulto. Puedes disfrutar del Premium compartido que consiga una persona adulta autorizada.', 'Rewards is reserved for people aged 18 or older. If you are under 18, do not request access or declare yourself an adult. You can still enjoy shared Premium earned by an authorized adult.')}</Text>
        <Text style={s.noticeText}>{t('Las solicitudes, aprobaciones y creación de retos están pausadas en esta versión hasta incorporar una verificación de edad adecuada. No se solicitan fechas de nacimiento, documentos ni datos biométricos.', 'Requests, approvals, and challenge creation are paused in this version until suitable age verification is added. No birth dates, identity documents, or biometric data are requested.')}</Text>
      </View>

      <View style={s.statsRow}>
        <View style={s.statCard}><Text style={s.statNumber}>{activeGuardians}</Text><Text style={s.statLabel}>{t('Adultos autorizados', 'Authorized adults')}</Text></View>
        <View style={s.statCard}><Text style={s.statNumber}>{pendingGuardians}</Text><Text style={s.statLabel}>{t('Autorizaciones pendientes', 'Pending authorizations')}</Text></View>
      </View>
      <View style={s.statsRow}>
        <View style={s.statCard}><Text style={s.statNumber}>{pendingRequests}</Text><Text style={s.statLabel}>{t('Solicitudes pendientes', 'Pending requests')}</Text></View>
        <View style={s.statCard}><Text style={s.statNumber}>{approvedRequests}</Text><Text style={s.statLabel}>{t('Recompensas aprobadas', 'Approved rewards')}</Text></View>
      </View>

      <View style={s.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.sectionTitle}>{t('Retos del hogar', 'Household challenges')}</Text>
          <Text style={s.muted}>{t('Retos activos disponibles en este hogar.', 'Active challenges in this household.')}</Text>
        </View>
        <TouchableOpacity style={s.refreshButton} onPress={() => { setRefreshing(true); void loadRewards(false); }} disabled={refreshing}>
          <Text style={s.refreshText}>{refreshing ? '…' : t('Actualizar', 'Refresh')}</Text>
        </TouchableOpacity>
      </View>
      {error ? <View style={s.errorCard}><Text style={s.errorText}>{error}</Text></View> : null}
      {challenges.length === 0 ? (
        <View style={s.emptyCard}><Text style={s.emptyTitle}>{t('Todavía no hay retos activos', 'No active challenges yet')}</Text><Text style={s.muted}>{t('Los retos aparecerán aquí cuando se habilite la gestión para adultos.', 'Challenges will appear here when adult management is enabled.')}</Text></View>
      ) : challenges.map((challenge) => (
        <View key={challenge.id} style={s.challengeCard}>
          <Text style={s.challengeTitle}>{challenge.title}</Text>
          {challenge.description ? <Text style={s.muted}>{challenge.description}</Text> : null}
        </View>
      ))}
      <Text style={s.footer}>{t('Hogar Feliz Rewards · Una casa, un equipo.', 'Hogar Feliz Rewards · One home, one team.')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  loading: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 16, marginBottom: 16 },
  backText: { color: '#247A58', fontSize: 13, fontWeight: '800' },
  heading: { marginBottom: 18 },
  eyebrow: { color: '#8B9A8F', fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 },
  title: { color: '#18372B', fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: '#819087', fontSize: 13, marginTop: 5 },
  premiumCard: { backgroundColor: '#176B50', borderRadius: 23, padding: 21, marginBottom: 14 },
  premiumEyebrow: { color: '#D1E5D5', fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginBottom: 10 },
  premiumTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  premiumDays: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginTop: 8 },
  premiumMeta: { color: '#D1E5D5', fontSize: 11, marginTop: 5, lineHeight: 17 },
  sharedNote: { color: '#E6F2E8', fontSize: 11, lineHeight: 17, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  noticeCard: { backgroundColor: '#FFF8E9', borderColor: '#F0E2BE', borderWidth: 1, borderRadius: 19, padding: 17, marginBottom: 15 },
  noticeTitle: { color: '#74551D', fontSize: 14, fontWeight: '900', marginBottom: 7 },
  noticeText: { color: '#796B4F', fontSize: 11, lineHeight: 17, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 17, padding: 15, borderWidth: 1, borderColor: '#E7EEE7' },
  statNumber: { color: '#18372B', fontSize: 23, fontWeight: '900' },
  statLabel: { color: '#87948B', fontSize: 10, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 12, gap: 8 },
  sectionTitle: { color: '#18372B', fontSize: 17, fontWeight: '900', marginBottom: 4 },
  muted: { color: '#87948B', fontSize: 11, lineHeight: 16 },
  refreshButton: { borderWidth: 1, borderColor: '#247A58', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  refreshText: { color: '#247A58', fontSize: 11, fontWeight: '800' },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 17, padding: 18, borderWidth: 1, borderColor: '#E7EEE7' },
  emptyTitle: { color: '#18372B', fontSize: 13, fontWeight: '900', marginBottom: 5 },
  challengeCard: { backgroundColor: '#FFFFFF', borderRadius: 17, padding: 17, borderWidth: 1, borderColor: '#E7EEE7', marginBottom: 10 },
  challengeTitle: { color: '#18372B', fontSize: 14, fontWeight: '900', marginBottom: 5 },
  errorCard: { backgroundColor: '#FFF1F0', borderRadius: 13, padding: 12, marginBottom: 12 },
  errorText: { color: '#A43F36', fontSize: 11, lineHeight: 16 },
  footer: { color: '#9AA79D', fontSize: 9, fontWeight: '800', letterSpacing: 1, textAlign: 'center', marginTop: 25, marginBottom: 8 },
});
