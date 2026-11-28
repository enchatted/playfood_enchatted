import React, { useEffect } from 'react';
import useGameStore from '../store/gameStore.js';
import { initAnalytics, track } from '../utils/analytics.js';
import { watchVisitTiming } from '../utils/visitTiming.js';
import { installTestMode, applyTestUrlParams } from '../utils/testMode.js';
import LanguageSelector from '../screens/LanguageSelector.jsx';
import AvatarSelector from '../screens/AvatarSelector.jsx';
import MainMenu from '../screens/MainMenu.jsx';
import WorldMap from '../screens/WorldMap.jsx';
import IslandRoom from '../screens/IslandRoom.jsx';
import LighthouseRoom from '../screens/LighthouseRoom.jsx';
import GameScreen from '../screens/GameScreen.jsx';
import ResultScreen from '../screens/ResultScreen.jsx';
import CertificateScreen from '../screens/CertificateScreen.jsx';
import TouchDpad from './TouchDpad.jsx';
import AudioToggle, { shouldRenderGlobalAudioToggle } from './AudioToggle.jsx';
import { ActiveCanvasStage } from './ActiveCanvasStage.jsx';
import { syncMusicForScreen } from '../utils/music.js';
import { getTouchControlCapabilities } from '../utils/touchControls.js';

// Screens where the on-screen touch d-pad is relevant. TouchDpad itself
// gates on device (tablet/whiteboard, see utils/touchControls.js) — this
// just narrows which screens ever try to mount it.
/**
 * GameContainer — State-based router (Section 4)
 *
 * Screen states:
 *   'lang'    → LanguageSelector
 *   'avatar'  → AvatarSelector (choose-your-hero ceremony)
 *   'menu'    → MainMenu
 *   'hub'     → WorldMap
 *   'island'  → IslandRoom
 *   'game'    → GameScreen
 *   'result'  → ResultScreen
 */
export default function GameContainer() {
  const currentScreen = useGameStore((s) => s.currentScreen);
  const navigationData = useGameStore((s) => s.navigationData);
  const navigate = useGameStore((s) => s.navigate);
  const touchCapabilities = getTouchControlCapabilities(
    currentScreen,
    navigationData?.mission,
  );

  // Έναρξη συνεδρίας + έξοδος. Δεν υπάρχει χρονόμετρο: μόνο στιγμές με νόημα.
  React.useEffect(() => {
    // Read at dispatch time, without starting another session on locale changes.
    initAnalytics(() => {
      const state = useGameStore.getState();
      return state.currentScreen === 'lang' ? null : state.language;
    });
    return watchVisitTiming();
  }, []);

  // Είσοδος σε νησί
  const islandSlug = useGameStore((s) => s.navigationData?.island);
  React.useEffect(() => {
    if (currentScreen === 'island' && islandSlug) track('island_enter', { island: islandSlug });
  }, [currentScreen, islandSlug]);

  // Dev-only: expose window.__playfood for automated play-testing.
  // Tree-shaken in production builds via import.meta.env.DEV check.
  useEffect(() => {
    installTestMode(useGameStore);
    applyTestUrlParams(useGameStore);
  }, []);

  // One quiet, continuous soundtrack follows the state router. The controller
  // keeps the same Audio element alive across screens and handles autoplay
  // retry after the child's first real key or pointer gesture.
  useEffect(() => {
    syncMusicForScreen(currentScreen);
  }, [currentScreen]);

  // Warn before an accidental tab close / navigation away while there's
  // progress — the Play Code is only shown on Exit, so leaving without copying
  // it would lose it. Reads fresh state each fire (no stale closure).
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      const { points, getTotalCompleted } = useGameStore.getState();
      if (points > 0 || getTotalCompleted() > 0) {
        e.preventDefault();
        e.returnValue = ''; // triggers the browser's native confirmation dialog
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'lang':
        return <LanguageSelector onNavigate={navigate} />;
      case 'avatar':
        return <AvatarSelector onNavigate={navigate} />;
      case 'menu':
        return <MainMenu onNavigate={navigate} />;
      case 'hub':
        return <WorldMap onNavigate={navigate} />;
      case 'island':
        return (
          <IslandRoom
            island={navigationData.island}
            onNavigate={navigate}
          />
        );
      case 'lighthouse':
        return <LighthouseRoom onNavigate={navigate} />;
      case 'certificate':
        return <CertificateScreen onNavigate={navigate} />;
      case 'game':
        return (
          <GameScreen
            island={navigationData.island}
            mission={navigationData.mission}
            missionId={navigationData.missionId}
            roundSeed={navigationData.roundSeed}
            onNavigate={navigate}
          />
        );
      case 'result':
        return (
          <ResultScreen
            island={navigationData.island}
            mission={navigationData.mission}
            missionId={navigationData.missionId}
            score={navigationData.score}
            passed={navigationData.passed}
            healthyHarvests={navigationData.healthyHarvests}
            wrongToolCount={navigationData.wrongToolCount}
            tier={navigationData.tier}
            healed={navigationData.healed}
            correct={navigationData.correct}
            suboptimal={navigationData.suboptimal}
            mistakes={navigationData.mistakes}
            chemicalUses={navigationData.chemicalUses}
            stars={navigationData.stars}
            bestStreak={navigationData.bestStreak}
            firstTryCount={navigationData.firstTryCount}
            completed={navigationData.completed}
            total={navigationData.total}
            leaks={navigationData.leaks}
            safe={navigationData.safe}
            transgressed={navigationData.transgressed}
            missed={navigationData.missed}
            traveled={navigationData.traveled}
            marketRecap={navigationData.marketRecap}
            axes={navigationData.axes}
            roundSeed={navigationData.roundSeed}
            onNavigate={navigate}
          />
        );
      default:
        return <LanguageSelector onNavigate={navigate} />;
    }
  };

  return (
    <ActiveCanvasStage>
      {renderScreen()}
      {shouldRenderGlobalAudioToggle(currentScreen) && <AudioToggle screen={currentScreen} />}
      {/* On-screen touch controls: TouchDpad itself gates on device
          (tablet/whiteboard) and renders null everywhere else. */}
      {touchCapabilities && <TouchDpad capabilities={touchCapabilities}
        mission={currentScreen === 'game' ? navigationData?.mission : undefined} />}
    </ActiveCanvasStage>
  );
}
