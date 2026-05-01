import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export function Nav() {
  const { isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();

  const onSignOut = () => {
    signOut();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav__brand">
        <span className="brand-mark" aria-hidden="true">
          ◆
        </span>
        <span>Shop</span>
      </div>
      <ul className="nav__links">
        <li>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
            Products
          </NavLink>
        </li>
        <li>
          <NavLink to="/cart" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            Cart
          </NavLink>
        </li>
        <li>
          <NavLink to="/orders" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            Orders
          </NavLink>
        </li>
      </ul>
      <div className="nav__actions">
        {isAuthenticated ? (
          <button type="button" className="btn btn--ghost" onClick={onSignOut}>
            Log out
          </button>
        ) : (
          <>
            <NavLink to="/login" className="btn btn--ghost">
              Log in
            </NavLink>
            <NavLink to="/register" className="btn btn--primary">
              Sign up
            </NavLink>
          </>
        )}
      </div>
    </nav>
  );
}
