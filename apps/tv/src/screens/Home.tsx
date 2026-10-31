import { useEffect } from 'preact/hooks';
import { BRAND } from '@iptv/shared';
import { useApp } from '../app-context';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { API_URL } from '../lib/api';

/**
 * Accueil (étape 1 : coquille). Les rangées « Reprendre », « Favoris »,
 * « Films récents »… arrivent avec les étapes Live / Films / Séries.
 */
export function HomeScreen() {
  const app = useApp();
  const me = app.me;

  // Revalide le profil à chaque retour sur l'accueil (détecte une révocation / nouvelle playlist).
  useEffect(() => {
    app.boot();
  }, []);

  const dashboard = API_URL.replace(/^https?:\/\//, '');

  return (
    <div class="screen">
      <ScreenHeader title="Accueil" backHint="Quitter" />
      <section class="hero">
        <p class="eyebrow">{me ? me.device.name : 'Chargement…'}</p>
        {me && me.playlist ? (
          <>
            <h1 class="hero-title">{me.playlist.name}</h1>
            <p class="hero-sub">
              Playlist active{me.playlist.status === 'syncing' ? ' · synchronisation en cours…' : me.playlist.status === 'error' ? ' · erreur de synchronisation' : ''}
            </p>
          </>
        ) : (
          <>
            <h1 class="hero-title">Bienvenue sur {BRAND.name}</h1>
            <p class="hero-sub">
              Aucune playlist n&apos;est assignée à cette TV. Ajoutez-en une depuis
              <strong class="accent"> {dashboard}</strong>, elle apparaîtra ici automatiquement.
            </p>
          </>
        )}
        <div class="row-actions">
          {me && me.playlist && (
            <Button id="home-live" variant="primary" onSelect={() => app.push('live')} autoFocus>
              TV en direct
            </Button>
          )}
          <Button id="home-refresh" variant={me && me.playlist ? 'ghost' : 'primary'} onSelect={app.boot} autoFocus={!(me && me.playlist)}>
            Actualiser
          </Button>
          <Button id="home-settings" onSelect={() => app.push('settings')}>
            Réglages
          </Button>
        </div>
      </section>
    </div>
  );
}
