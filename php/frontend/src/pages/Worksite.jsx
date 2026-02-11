import { useNavigate } from 'react-router-dom';
import { actionCards } from '../data/machines.js';

export default function Worksite() {
    const navigate = useNavigate();

    const handleSelect = (to) => {
        navigate(to);
    };

    return (
        <div className="portal">
            <section className="action-card-grid">
                {actionCards.map((card) => (
                    <button type="button" className="action-card" key={card.id} onClick={() => handleSelect(card.to)}>
                        <img src={card.icon} alt="icon" />
                        <div>
                            <h3>{card.title}</h3>
                            <p>{card.description}</p>
                            <span className="category-link">{card.cta}</span>
                        </div>
                    </button>
                ))}
            </section>
        </div>
    );
}
