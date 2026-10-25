import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { supabase } from './src/supabase';

export default function App() {
  const [mode, setMode] = useState<'signin'|'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string|null>(null);
  const [familyReady, setFamilyReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => setSessionEmail(data.session?.user.email ?? null));
    const {data: listener} = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user.email ?? null);
      if (!session) setFamilyReady(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); } catch (e: any) { Alert.alert('Ups, algo pasó', e?.message ?? 'Inténtalo otra vez.'); }
    finally { setBusy(false); }
  };

  const signIn = () => run(async () => {
    const {error} = await supabase.auth.signInWithPassword({email: email.trim(), password});
    if (error) throw error;
  });
  const signUp = () => run(async () => {
    if (!displayName.trim()) throw new Error('Escribe tu nombre para mostrar.');
    const {data, error} = await supabase.auth.signUp({email: email.trim(), password, options:{data:{display_name:displayName.trim()}}});
    if (error) throw error;
    if (!data.session) Alert.alert('Revisa tu correo', 'Confirma tu correo si Supabase lo solicita antes de iniciar sesión.');
  });
  const createFamily = () => run(async () => {
    if (!familyName.trim()) throw new Error('Escribe el nombre de la familia.');
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const {error} = await supabase.rpc('create_household', {p_name:familyName.trim(), p_invite_code:code, p_display_name:displayName.trim() || email.split('@')[0]});
    if (error) throw error;
    setFamilyReady(true);
    Alert.alert('¡Familia creada!', `Tu código familiar es ${code}. Compártelo solo con las personas que quieras invitar.`);
  });
  const joinFamily = () => run(async () => {
    if (!inviteCode.trim()) throw new Error('Escribe el código familiar.');
    const {error} = await supabase.rpc('join_household_by_code', {p_code:inviteCode.trim().toUpperCase(), p_display_name:displayName.trim() || email.split('@')[0]});
    if (error) throw error;
    setFamilyReady(true);
    Alert.alert('¡Listo!', 'Te has unido al hogar.');
  });
  const signOut = () => run(async () => { const {error} = await supabase.auth.signOut(); if (error) throw error; });

  return <SafeAreaView style={s.safe}>
    <ExpoStatusBar style="dark" /><StatusBar barStyle="dark-content" backgroundColor="#F5F7FB"/>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <View style={s.brandRow}><View style={s.logo}><Text style={s.logoText}>⌂</Text></View><View><Text style={s.brand}>Hogar Feliz</Text><Text style={s.tagline}>Una casa, un equipo.</Text></View></View>
        {sessionEmail ? <View style={s.card}>
          <View style={s.successIcon}><Text style={{fontSize:28,color:'#16834A'}}>✓</Text></View>
          <Text style={s.title}>¡Hola!</Text><Text style={s.subtitle}>Sesión iniciada como {sessionEmail}</Text>
          <Text style={s.sectionTitle}>Tu familia</Text><Text style={s.helper}>Crea un hogar nuevo o únete con el código que te compartieron.</Text>
          <TextInput style={s.input} placeholder="Nombre para mostrar" placeholderTextColor="#9299A8" value={displayName} onChangeText={setDisplayName}/>
          <TextInput style={s.input} placeholder="Nombre de la familia" placeholderTextColor="#9299A8" value={familyName} onChangeText={setFamilyName}/>
          <TouchableOpacity style={s.primary} onPress={createFamily} disabled={busy}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>＋ Crear familia</Text>}</TouchableOpacity>
          <View style={s.orLine}><View style={s.line}/><Text style={s.orText}>O ÚNETE A UNA</Text><View style={s.line}/></View>
          <TextInput style={s.input} placeholder="Código familiar" placeholderTextColor="#9299A8" autoCapitalize="characters" value={inviteCode} onChangeText={setInviteCode}/>
          <TouchableOpacity style={s.secondary} onPress={joinFamily} disabled={busy}><Text style={s.secondaryText}>Unirme con código</Text></TouchableOpacity>
          {familyReady && <Text style={s.helper}>¡Conexión con el hogar completada! El panel de tareas es el siguiente paso.</Text>}
          <TouchableOpacity onPress={signOut} style={s.linkButton}><Text style={s.link}>Cerrar sesión</Text></TouchableOpacity>
        </View> : <View style={s.card}>
          <Text style={s.eyebrow}>BIENVENIDO A CASA</Text><Text style={s.title}>{mode==='signup'?'Crea tu cuenta':'Qué bueno verte'}</Text>
          <Text style={s.subtitle}>{mode==='signup'?'Empieza a organizar tu hogar en equipo.':'Entra para organizar las tareas de casa.'}</Text>
          {mode==='signup' && <TextInput style={s.input} placeholder="Nombre para mostrar" placeholderTextColor="#9299A8" value={displayName} onChangeText={setDisplayName}/>}
          <TextInput style={s.input} placeholder="Correo electrónico" placeholderTextColor="#9299A8" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}/>
          <TextInput style={s.input} placeholder="Contraseña (mínimo 6 caracteres)" placeholderTextColor="#9299A8" secureTextEntry value={password} onChangeText={setPassword}/>
          <TouchableOpacity style={s.primary} onPress={mode==='signup'?signUp:signIn} disabled={busy}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>{mode==='signup'?'Crear cuenta  →':'Iniciar sesión  →'}</Text>}</TouchableOpacity>
          <TouchableOpacity onPress={()=>setMode(mode==='signup'?'signin':'signup')} style={s.linkButton}><Text style={s.link}>{mode==='signup'?'Ya tengo cuenta · Iniciar sesión':'¿Primera vez aquí? Crear cuenta'}</Text></TouchableOpacity>
          <View style={s.privacy}><Text style={s.privacyText}>🔒 Tus datos se protegen mediante los permisos de tu familia.</Text></View>
        </View>}
        <Text style={s.footer}>HECHO PARA VIVIR MEJOR EN EQUIPO</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
 safe:{flex:1,backgroundColor:'#F5F7FB'}, container:{flexGrow:1,paddingHorizontal:22,paddingTop:34,paddingBottom:28,justifyContent:'center'},
 brandRow:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:28}, logo:{width:52,height:52,borderRadius:17,backgroundColor:'#315CE8',alignItems:'center',justifyContent:'center',elevation:5}, logoText:{fontSize:34,color:'#fff',fontWeight:'700',marginTop:-5}, brand:{color:'#17213A',fontSize:23,fontWeight:'800',letterSpacing:-0.5}, tagline:{color:'#79839A',fontSize:13,marginTop:2},
 card:{backgroundColor:'#fff',borderRadius:26,padding:23,borderWidth:1,borderColor:'#E8ECF4',elevation:3}, eyebrow:{color:'#315CE8',fontSize:11,fontWeight:'800',letterSpacing:1.6,marginBottom:10}, title:{color:'#17213A',fontSize:29,fontWeight:'800',letterSpacing:-0.8}, subtitle:{color:'#7B8498',fontSize:14,lineHeight:21,marginTop:8,marginBottom:23},
 input:{backgroundColor:'#F7F8FC',borderColor:'#E5E9F2',borderWidth:1,borderRadius:14,paddingHorizontal:15,paddingVertical:15,color:'#17213A',fontSize:14,marginBottom:12}, primary:{backgroundColor:'#315CE8',borderRadius:14,minHeight:52,alignItems:'center',justifyContent:'center',marginTop:5,elevation:2}, primaryText:{color:'#fff',fontSize:15,fontWeight:'700'}, secondary:{borderRadius:14,minHeight:50,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#D8E0F5',backgroundColor:'#F5F7FF'}, secondaryText:{color:'#315CE8',fontSize:15,fontWeight:'700'}, linkButton:{alignItems:'center',paddingVertical:17}, link:{color:'#315CE8',fontWeight:'700',fontSize:13,textAlign:'center'}, privacy:{backgroundColor:'#F5F8FF',borderRadius:12,padding:12,marginTop:3}, privacyText:{color:'#697895',fontSize:11,textAlign:'center'}, footer:{textAlign:'center',color:'#A2A9B8',fontSize:10,fontWeight:'700',letterSpacing:1.2,marginTop:24}, successIcon:{width:54,height:54,borderRadius:18,backgroundColor:'#E8F8EF',alignItems:'center',justifyContent:'center',marginBottom:16}, sectionTitle:{color:'#17213A',fontSize:17,fontWeight:'800',marginTop:3,marginBottom:5}, helper:{color:'#7B8498',fontSize:13,lineHeight:19,marginBottom:15}, orLine:{flexDirection:'row',alignItems:'center',gap:10,marginVertical:20}, line:{height:1,backgroundColor:'#E9EDF4',flex:1}, orText:{color:'#9AA2B3',fontSize:9,fontWeight:'800',letterSpacing:1}
});
