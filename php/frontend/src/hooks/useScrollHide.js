import { useEffect, useRef, useState } from 'react';

export default function useScrollHide(offset = 80, delta = 12) {
    const [isHidden, setIsHidden] = useState(false);
    const lastScroll = useRef(0);

    useEffect(() => {
        const handleScroll = () => {
            const current = window.scrollY;
            const previous = lastScroll.current;
            const isScrollingDown = current > previous;
            if (Math.abs(current - previous) < delta) {
                return;
            }
            if (isScrollingDown && current > offset) {
                setIsHidden(true);
            } else {
                setIsHidden(false);
            }
            lastScroll.current = current;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [offset, delta]);

    return isHidden;
}
