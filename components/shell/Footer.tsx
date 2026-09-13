import { REPO_URL, STUDYVAULTS_URL } from "@/lib/site";

/** Pie compacto de una sola franja: origen, aviso y enlaces. */
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
