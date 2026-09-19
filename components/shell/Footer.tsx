import { ISSUE_URL, REPO_URL, STUDYVAULTS_URL } from "@/lib/site";

/** Pie compacto de una sola franja: origen, aviso y enlaces. «¿Un dato está mal?» abre
 *  el formulario de issue prellenado: es la puerta para que cualquiera avise (y, si quiere,
 *  corrija por PR) sin pasar por el autor. */
export default function Footer() {
  return (
    <footer className="footer cuatris-footer">
      <div className="container footer__bottom">
        <span>
          <b>Cuatris</b> // planificador de cursada · ITBA
        </span>
        <span>
          No es material oficial de la universidad: verificá contra el SGA.
        </span>
        <span className="cuatris-footer__links">
          <a href={ISSUE_URL} target="_blank" rel="noopener noreferrer">
            ¿Un dato está mal?
          </a>
          <a href={STUDYVAULTS_URL} target="_blank" rel="noopener noreferrer">
            StudyVaults
          </a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </span>
      </div>
    </footer>
  );
}
