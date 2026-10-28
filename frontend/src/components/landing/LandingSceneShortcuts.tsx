import { Button } from '@/components/ui/button';
import { LANDING_SCENES, type LandingScene } from '@/data/landingScenes';

export function LandingSceneShortcuts({ onSelect }: { onSelect: (scene: LandingScene) => void }) {
  return (
    <div className="landing-scenes" role="group" aria-label="从场景开始">
      {LANDING_SCENES.map((scene) => (
        <Button
          key={scene.label}
          type="button"
          variant="ghost"
          size="compact"
          className="landing-scenes__item"
          onClick={() => onSelect(scene)}
        >
          {scene.label}
        </Button>
      ))}
    </div>
  );
}
