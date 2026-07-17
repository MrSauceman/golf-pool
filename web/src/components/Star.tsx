import { isFav, toggleFav, useFavorites } from '../lib/favorites';

export function Star({ id, stop = true }: { id: string; stop?: boolean }) {
  useFavorites(); // subscribe for re-render
  const on = isFav(id);
  return (
    <button
      className={`star ${on ? 'on' : ''}`}
      title={on ? 'Remove from My Teams' : 'Add to My Teams'}
      onClick={(e) => {
        if (stop) e.stopPropagation();
        toggleFav(id);
      }}
    >
      {on ? '★' : '☆'}
    </button>
  );
}
